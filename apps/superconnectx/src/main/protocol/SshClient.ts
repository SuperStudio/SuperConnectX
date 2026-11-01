import { Client, ClientChannel, ConnectConfig } from 'ssh2'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import BaseClient, { ILogger, SendOptions } from './BaseClient'
import ConnectionInfo from './ConnectionInfo'
import { BufferLineSplitter } from './BufferLineSplitter'
import SshKnownHostsStorage from '../storage/SshKnownHostsStorage'

const DEFAULT_SSH_PORT = 22
const DEFAULT_READY_TIMEOUT_MS = 15 * 1000
const DEFAULT_KEEPALIVE_INTERVAL_MS = 10 * 1000
const READ_INTERVAL_MS = 10 // 固定10ms读取间隔
const DEFAULT_TERMINAL_TYPE = 'vt100'
// 未拿到渲染层行列时的 PTY 兜底尺寸（xterm 默认值也是 80x24）
const DEFAULT_PTY_ROWS = 24
const DEFAULT_PTY_COLS = 80
// 估算单个字符的像素尺寸，用于 PTY 的 height/width（服务端一般忽略，但部分程序会读）
const DEFAULT_PTY_CELL_HEIGHT = 18
const DEFAULT_PTY_CELL_WIDTH = 9

interface SshConnectionInfo {
  host: string
  port: number
  username: string
}

interface SshConnection {
  client: Client
  stream: ClientChannel | null
  buffer: Buffer
  timer: NodeJS.Timeout | null
  onData: any
  onClose: any
  onLog: any
  splitter: BufferLineSplitter
}

/**
 * SSH 客户端
 *
 * 基于 ssh2（纯 JS，可在 worker_threads 中运行）实现 SSH shell 会话。
 * 生命周期与数据流转完全对齐 TelnetClient：
 *   连接 -> shell 通道 -> 缓冲累积 -> 定时按行刷出 -> 关闭清理
 *
 * P1 阶段补齐：
 *   - 私钥认证（authMethod='key' + privateKeyPath + passphrase）
 *   - 主机密钥指纹校验（known_hosts，首次连接信任 + 指纹变更拒绝）
 *
 * TODO(P2) keyboard-interactive / 跳板机 ProxyJump。
 */
export default class SshClient extends BaseClient {
  sshClients = new Map<string, Client>()
  connectionInfos = new Map<string, SshConnectionInfo>()
  sshConnectionData = new Map<string, SshConnection>()
  private readonly knownHosts: SshKnownHostsStorage

  constructor(logger?: ILogger, options?: { knownHostsDir?: string }) {
    super(logger)
    if (!options?.knownHostsDir) {
      // Worker 环境无法访问 Electron API，known_hosts 目录必须由主进程经 workerData 注入
      throw new Error('SshClient requires options.knownHostsDir for known_hosts storage')
    }
    this.knownHosts = new SshKnownHostsStorage(options.knownHostsDir)
  }

  /** 计算主机密钥指纹：SHA256:base64（去尾部 =），与 OpenSSH known_hosts 格式一致 */
  static computeFingerprint(key: Buffer): string {
    return `SHA256:${createHash('sha256')
      .update(key)
      .digest('base64')
      .replace(/=+$/, '')}`
  }

  // 处理缓冲区数据：SSH 走 PTY，输出是带 \r\n 与 ANSI 控制序列的连续字节流。
  // 不能按行拆分——拆行会剥掉 \r 与行尾换行符，终端模式（xterm）下换行信息
  // 丢失，所有输出会挤在一行。这里整段解码后原样下发，换行/回车语义
  // 由渲染层按视图处理（xterm 原生解析；日志视图由 AnsiParser 去 \r）。
  private processBuffer(sessionId: string): void {
    try {
      const connData = this.sshConnectionData.get(sessionId)
      if (!connData) return

      const { buffer, splitter, onData, onLog } = connData
      if (!buffer || buffer.length === 0) return

      // decodeCompletePrefix 只解码完整字符（多字节截断部分留在 remainder），
      // 不改动 \r\n 等控制字节；HEX 模式内部会整段转 hex，行为不变
      const flushed = splitter.decodeCompletePrefix(buffer)
      connData.buffer = flushed.remainder

      if (flushed.text) {
        const timestamp = BufferLineSplitter.timestamp()
        onData?.({ data: flushed.text, timestamp })
        onLog?.(flushed.text, timestamp)
      }
    } catch (err: any) {
      this.logger.error(`processBuffer error: ${err?.message || err}`)
    }
  }

  async start(info: ConnectionInfo, onData: any, onClose: any, onLog: any): Promise<object> {
    const host = info.host
    const port = info.port
    const sessionId = info.sessionId
    const client = new Client()
    // 主机密钥校验结果：trusted=已授信 / first=首次连接 / mismatch=指纹变更
    // 用对象包裹而非裸变量：hostVerifier 是同步回调，TS 无法感知其中的赋值，
    // 裸变量会被静态推断为永远 'trusted'，导致后续比较报错也无意义
    const hostVerify: { result: 'trusted' | 'first' | 'mismatch' } = { result: 'trusted' }

    try {
      // ---- 认证方式：密码 或 私钥 ----
      const usePrivateKey = info.authMethod === 'key'
      let privateKey: Buffer | undefined
      if (usePrivateKey) {
        const keyPath = info.privateKeyPath
        if (!keyPath) {
          return { success: false, message: '使用私钥认证时必须指定私钥文件路径' }
        }
        try {
          privateKey = readFileSync(keyPath)
        } catch (readErr) {
          const reason = readErr instanceof Error ? readErr.message : String(readErr)
          return { success: false, message: `读取私钥文件失败：${keyPath}（${reason}）` }
        }
      }

      const config: ConnectConfig = {
        host: host,
        port: port || DEFAULT_SSH_PORT,
        username: info.username,
        readyTimeout: DEFAULT_READY_TIMEOUT_MS,
        keepaliveInterval: DEFAULT_KEEPALIVE_INTERVAL_MS,
        keepaliveCountMax: 3,
        // P1：密码 / 私钥两种认证。TODO(P2) keyboard-interactive / 跳板机 ProxyJump
        tryKeyboard: false,
        // 不设置 hostHash，回调收到的是原始主机密钥 Buffer，
        // 指纹格式由我们自己算（SHA256:base64），不受 ssh2 内部格式差异影响
        hostVerifier: (key: Buffer) => {
          const fingerprint = SshClient.computeFingerprint(key)
          const known = this.knownHosts.getFingerprint(host, port)
          if (known === null) {
            // 首次连接：记录指纹并放行（Trust On First Use）
            this.knownHosts.trust(host, port, fingerprint)
            hostVerify.result = 'first'
            this.logger.info(`ssh new host recorded: ${host}:${port} ${fingerprint}`)
            return true
          }
          if (known === fingerprint) {
            return true
          }
          // 指纹变更：极可能是中间人攻击，直接拒绝
          hostVerify.result = 'mismatch'
          this.logger.error(
            `ssh host key mismatch: ${host}:${port} known=${known} got=${fingerprint}`
          )
          return false
        }
      }

      if (usePrivateKey) {
        config.privateKey = privateKey
        if (info.passphrase) config.passphrase = info.passphrase
      } else {
        config.password = info.password
      }

      this.logger.info(
        `start to connect ssh: ${host}:${config.port} (session: ${sessionId}, auth: ${
          usePrivateKey ? 'key' : 'password'
        })`
      )

      // 等待握手 + 认证完成
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          client.removeListener('ready', onReady)
          client.removeListener('error', onError)
        }
        const onReady = () => {
          cleanup()
          resolve()
        }
        const onError = (err: Error) => {
          cleanup()
          reject(err)
        }
        client.on('ready', onReady)
        client.on('error', onError)
        client.connect(config)
      })

      // 打开交互式 shell 通道（pty）。
      // 终端模式下带上渲染层给出的实际行列，避免 vim/less 先按 80x24 排版窗口尺寸同步后再重排导致闪烁
      const ptyRows = info.rows && info.rows > 0 ? info.rows : DEFAULT_PTY_ROWS
      const ptyCols = info.cols && info.cols > 0 ? info.cols : DEFAULT_PTY_COLS
      const stream = await new Promise<ClientChannel>((resolve, reject) => {
        client.shell(
          {
            term: DEFAULT_TERMINAL_TYPE,
            rows: ptyRows,
            cols: ptyCols,
            height: ptyRows * DEFAULT_PTY_CELL_HEIGHT,
            width: ptyCols * DEFAULT_PTY_CELL_WIDTH
          },
          (err, channel) => {
            if (err) {
              reject(err)
              return
            }
            resolve(channel)
          }
        )
      })

      this.sshClients.set(sessionId, client)
      this.connectionInfos.set(sessionId, {
        host,
        port: port || DEFAULT_SSH_PORT,
        username: info.username
      })

      const connData: SshConnection = {
        client,
        stream,
        buffer: Buffer.alloc(0),
        timer: null,
        onData,
        onClose,
        onLog,
        splitter: new BufferLineSplitter(info.encoding || 'utf8', false)
      }
      this.sshConnectionData.set(sessionId, connData)

      // 收集原始 Buffer 数据到缓冲区
      stream.on('data', (data: Buffer | string) => {
        const chunk = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8')
        connData.buffer = Buffer.concat([connData.buffer, chunk])
      })

      // 使用固定间隔处理数据
      connData.timer = setInterval(() => {
        this.processBuffer(sessionId)
      }, READ_INTERVAL_MS)

      // client 与 stream 都可能触发关闭，用 map 中的成员是否存在做幂等保护
      const handleClosed = () => {
        if (!this.sshConnectionData.has(sessionId)) return

        if (connData.timer) {
          clearInterval(connData.timer)
          connData.timer = null
        }
        // 关闭前输出缓冲区中剩余的数据
        if (connData.buffer && connData.buffer.length > 0) {
          const timestamp = BufferLineSplitter.timestamp()
          const remainingStr = connData.splitter.decodeFull(connData.buffer)
          connData.onData?.({ data: remainingStr, timestamp })
          connData.onLog?.(remainingStr, timestamp)
          connData.buffer = Buffer.alloc(0)
        }
        this.sshClients.delete(sessionId)
        this.connectionInfos.delete(sessionId)
        this.sshConnectionData.delete(sessionId)
        onClose?.()
      }

      this.logger.info(`ssh connect ok (session: ${sessionId})`)

      // 首次连接：把「已记录指纹」这一安全事实告知用户（写进终端 + 日志）
      if (hostVerify.result === 'first') {
        const noticeTs = BufferLineSplitter.timestamp()
        const notice = `[系统] 首次连接该主机，已记录其密钥指纹 ${this.knownHosts.getFingerprint(
          host,
          port
        )}；若日后指纹发生变化将拒绝连接。`
        onData?.({ data: notice, timestamp: noticeTs })
        onLog?.(notice, noticeTs)
      }

      client.on('close', () => {
        this.logger.info(`ssh connection closed: ${host}:${config.port}`)
        handleClosed()
      })
      stream.on('close', () => {
        this.logger.info(`ssh shell stream closed: ${host}:${config.port}`)
        handleClosed()
      })
      // 建立后的错误（如网络中断）记录日志，真正的清理交给紧随其后的 close 事件
      client.on('error', (err: Error) => {
        this.logger.error(`ssh client error: ${err?.message || err}`)
      })
      stream.on('error', (err: Error) => {
        this.logger.error(`ssh stream error: ${err?.message || err}`)
      })

      return { success: true, message: 'Connected successfully', connId: sessionId }
    } catch (error) {
      this.logger.error('ssh connect failed', { host, port, sessionId, error })
      // 连接失败时确保不会有半成品 client 残留
      try {
        client.removeAllListeners()
        client.end()
      } catch {
        /* ignore */
      }
      // 指纹变更属高危场景，给出比原始库错误更明确的中文说明
      if (hostVerify.result === 'mismatch') {
        return {
          success: false,
          message:
            `主机密钥指纹校验失败：${host}:${port} 的主机密钥与本地已记录的不一致，可能是服务器被重装/更换，也可能存在中间人攻击。` +
            `如已确认主机确实更换过密钥，请删除用户数据目录下 userdata/ssh-known-hosts.json 中该主机记录后重连。`
        }
      }
      return {
        success: false,
        message: error instanceof Error ? error.message : '连接失败'
      }
    }
  }

  async send(connId: string, command: string, onComplete: any, options?: SendOptions): Promise<object> {
    const connData = this.sshConnectionData.get(connId)
    const stream = connData?.stream
    if (!stream) {
      return { success: false, message: 'Connection does not exist' }
    }

    try {
      // 日志时间戳由主线程按 GUI 开关统一添加/省略
      const dataStr = `SEND >>>>>>>>>> ${command}`
      // 非终端模式：shell 会话以换行结束一条命令（等价交互式中敲回车）。
      // 终端模式（raw）：xterm 已给出按键本身的字节流，追加 \n 会破坏 Ctrl+C 等控制字符语义。
      const payload = options?.raw ? command : `${command}\n`
      stream.write(payload)
      onComplete?.(dataStr)

      this.logger.info(`send command: ${command}${options?.raw ? ' (raw)' : ''}`)
      return { success: true }
    } catch (error) {
      this.logger.error('ssh send failed', { connId, command, error })
      return {
        success: false,
        message: error instanceof Error ? error.message : '发送命令失败'
      }
    }
  }

  /**
   * 同步终端窗口尺寸到远端 PTY。
   * vim / top / less 等交互式程序依赖 SIGWINCH 重新计算排版，不同步会导致界面错乱。
   */
  async setWindowSize(connId: string, rows: number, cols: number): Promise<object> {
    const connData = this.sshConnectionData.get(connId)
    const stream = connData?.stream
    if (!stream) {
      return { success: false, message: 'Connection does not exist' }
    }

    try {
      stream.setWindow(rows, cols, rows * DEFAULT_PTY_CELL_HEIGHT, cols * DEFAULT_PTY_CELL_WIDTH)
      return { success: true, message: 'Window size updated' }
    } catch (error) {
      this.logger.error('ssh setWindow failed', { connId, rows, cols, error })
      return {
        success: false,
        message: error instanceof Error ? error.message : '同步窗口尺寸失败'
      }
    }
  }

  async disconnect(connId: string): Promise<object> {
    const client = this.sshClients.get(connId)
    const info = this.connectionInfos.get(connId)
    const connData = this.sshConnectionData.get(connId)
    if (client) {
      this.logger.info(`disconnect ssh: ${info?.host}:${info?.port}`)

      // 停止定时器
      if (connData?.timer) {
        clearInterval(connData.timer)
        connData.timer = null
      }

      // 主动断开前移除 close 事件监听器，防止触发 onClose 回调导致重连
      client.removeAllListeners('close')
      if (connData?.stream) {
        connData.stream.removeAllListeners()
      }
      client.end()
      this.sshClients.delete(connId)
      this.connectionInfos.delete(connId)
      this.sshConnectionData.delete(connId)
    } else {
      this.logger.warn('not find connId for disconnect', { connId })
    }
    return { success: true }
  }

  async updateConfig(_connId: string, _config: any): Promise<object> {
    // SSH 连接不支持运行时参数热更新（host/port/认证 无法动态变更）
    // receiveHex 和 logTimestamp 的切换在主线程 / Worker 的 onData/onLog 回调中处理
    return { success: true, message: 'No config to update for SSH' }
  }
}
