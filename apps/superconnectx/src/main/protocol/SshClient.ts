import { Client, ClientChannel, ConnectConfig } from 'ssh2'
import BaseClient, { ILogger } from './BaseClient'
import ConnectionInfo from './ConnectionInfo'
import { BufferLineSplitter } from './BufferLineSplitter'

const DEFAULT_SSH_PORT = 22
const DEFAULT_READY_TIMEOUT_MS = 15 * 1000
const DEFAULT_KEEPALIVE_INTERVAL_MS = 10 * 1000
const READ_INTERVAL_MS = 10 // 固定10ms读取间隔
const MAX_BUFFER_BYTES = 1024 * 1024 // 无换行输出也必须有上限，避免接收缓冲区无限增长
const DEFAULT_TERMINAL_TYPE = 'vt100'

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
 * P0 阶段仅支持「密码认证」，私钥 / keyboard-interactive / 主机指纹校验在 P1 补齐。
 */
export default class SshClient extends BaseClient {
  sshClients = new Map<string, Client>()
  connectionInfos = new Map<string, SshConnectionInfo>()
  sshConnectionData = new Map<string, SshConnection>()

  constructor(logger?: ILogger) {
    super(logger)
  }

  // 处理缓冲区数据，按行分割并添加时间戳
  private processBuffer(sessionId: string): void {
    try {
      const connData = this.sshConnectionData.get(sessionId)
      if (!connData) return

      const { buffer, splitter, onData, onLog } = connData
      if (!buffer || buffer.length === 0) return

      const result = splitter.split(buffer)
      connData.buffer = result.remainder

      if (result.count > 0) {
        const timestamp = BufferLineSplitter.timestamp()
        onData?.({ data: result.data, timestamp })
        onLog?.(result.log, timestamp)
      }

      // 与 Telnet 同理：某些程序持续输出不带换行的内容（进度条/提示符），
      // 若没有界刷新，remainder 会无限增长且永远到不了渲染进程。
      if (connData.buffer.length > MAX_BUFFER_BYTES) {
        const timestamp = BufferLineSplitter.timestamp()
        const flushed = splitter.decodeCompletePrefix(connData.buffer)
        connData.buffer = flushed.remainder
        if (flushed.text) {
          onData?.({ data: flushed.text, timestamp })
          onLog?.(flushed.text, timestamp)
        }
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

    try {
      const config: ConnectConfig = {
        host: host,
        port: port || DEFAULT_SSH_PORT,
        username: info.username,
        password: info.password,
        readyTimeout: DEFAULT_READY_TIMEOUT_MS,
        keepaliveInterval: DEFAULT_KEEPALIVE_INTERVAL_MS,
        keepaliveCountMax: 3,
        // P0：仅密码认证。TODO(P1) 支持 tryKeyboard / 私钥(keyboard-interactive) 认证
        tryKeyboard: false
      }

      this.logger.info(`start to connect ssh: ${host}:${config.port} (session: ${sessionId})`)

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

      // 打开交互式 shell 通道
      const stream = await new Promise<ClientChannel>((resolve, reject) => {
        client.shell({ term: DEFAULT_TERMINAL_TYPE }, (err, channel) => {
          if (err) {
            reject(err)
            return
          }
          resolve(channel)
        })
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
      return {
        success: false,
        message: error instanceof Error ? error.message : '连接失败'
      }
    }
  }

  async send(connId: string, command: string, onComplete: any): Promise<object> {
    const connData = this.sshConnectionData.get(connId)
    const stream = connData?.stream
    if (!stream) {
      return { success: false, message: 'Connection does not exist' }
    }

    try {
      // 日志时间戳由主线程按 GUI 开关统一添加/省略
      const dataStr = `SEND >>>>>>>>>> ${command}`
      // shell 会话以换行结束一条命令（等价交互式中敲回车）
      stream.write(command + '\n')
      onComplete?.(dataStr)

      this.logger.info(`send command: ${command}`)
      return { success: true }
    } catch (error) {
      this.logger.error('ssh send failed', { connId, command, error })
      return {
        success: false,
        message: error instanceof Error ? error.message : '发送命令失败'
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
