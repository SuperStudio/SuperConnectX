/**
 * FtpClient - FTP 客户端实现
 *
 * 基于 Node.js net 模块，手动实现 FTP 协议的控制连接和数据连接。
 * 支持：
 * - 主动模式 (PORT) 和被动模式 (PASV)
 * - 认证 (USER/PASS)
 * - 列出目录 (LIST)
 * - 下载文件 (RETR)
 * - 上传文件 (STOR)
 * - 删除文件 (DELE)
 * - 重命名文件 (RNFR/RNTO)
 * - 切换目录 (CWD/PWD/CDUP)
 * - 创建/删除目录 (MKD/RMD)
 *
 * 注意：FTP 服务端实现在 FtpServer.ts 中
 */
import * as net from 'net'
import * as fs from 'fs'
import * as path from 'path'
import BaseClient, { ILogger } from './BaseClient'
import ConnectionInfo from './ConnectionInfo'

interface FtpConnectionState {
  controlSocket: net.Socket
  host: string
  port: number
  username: string
  password: string
  loggedIn: boolean
  currentDir: string
  buffer: string
  pendingResolve: ((value: string) => void) | null
  pendingReject: ((reason: Error) => void) | null
  onData: ((dataObj: { data: string; timestamp: string }) => void) | null
  onClose: (() => void) | null
  onLog: ((logStr: string, timestamp: string) => void) | null
}

export default class FtpClient extends BaseClient {
  private connections: Map<string, FtpConnectionState> = new Map()

  constructor(logger?: ILogger) {
    super(logger)
  }

  /**
   * 生成时间戳字符串
   */
  private timestamp(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`
  }

  /**
   * 发出数据回调
   */
  private emitData(state: FtpConnectionState, data: string): void {
    const ts = this.timestamp()
    state.onData?.({ data, timestamp: ts })
    state.onLog?.(data, ts)
  }

  /**
   * 解析 FTP 响应码
   */
  private parseResponse(response: string): { code: number; message: string; isMultiline: boolean } {
    const code = parseInt(response.substring(0, 3), 10)
    const isMultiline = response.length > 3 && response[3] === '-'
    const message = response.substring(isMultiline ? 4 : 4)
    return { code, message, isMultiline }
  }

  /**
   * 发送 FTP 命令并等待响应
   */
  private async sendCommand(state: FtpConnectionState, command: string): Promise<string> {
    return new Promise((resolve, _reject) => {
      state.pendingResolve = resolve
      state.controlSocket.write(command + '\r\n')
      // 脱敏 PASS 命令，防止密码明文泄露到终端和日志
      const displayCommand = /^PASS\s/i.test(command) ? 'PASS ***' : command
      this.emitData(state, `>>> ${displayCommand}`)
    })
  }

  /**
   * 处理控制连接的响应数据
   */
  private handleControlData(state: FtpConnectionState, data: Buffer): void {
    state.buffer += data.toString('utf-8')

    // 处理多行响应 (以 XXX- 开头，XXX 结尾)
    const lines = state.buffer.split('\r\n')
    // 保留最后不完整的行（避免数据丢失）
    const lastLine = lines.pop() || ''
    state.buffer = lastLine

    let multilineEndCode: number | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue

      this.emitData(state, line)

      if (multilineEndCode !== null) {
        // 多行响应中
        const parsed = this.parseResponse(line)
        if (parsed.code === multilineEndCode && !parsed.isMultiline) {
          // 多行响应结束
          const fullResponse = lines.slice(0, i + 1).join('\r\n')
          const pendingResolve = state.pendingResolve
          state.pendingResolve = null
          state.pendingReject = null
          pendingResolve?.(fullResponse)
          multilineEndCode = null
        }
        continue
      }

      const parsed = this.parseResponse(line)
      if (parsed.isMultiline) {
        multilineEndCode = parsed.code
        continue
      }

      // 单行响应
      if (state.pendingResolve) {
        const pendingResolve = state.pendingResolve
        state.pendingResolve = null
        state.pendingReject = null
        pendingResolve(line)
      }
    }

    // 保留未处理完的数据（多行响应尚未结束时）
    if (multilineEndCode !== null) {
      // 当前 buffer 保留最后不完整的行 + 已处理的行重新拼接回去
      state.buffer = lines.join('\r\n') + (lastLine ? '\r\n' + lastLine : '')
    }
  }

  /**
   * 建立数据连接（被动模式）- 用于接收数据（LIST/RETR 等）
   */
  private async enterPassiveMode(state: FtpConnectionState): Promise<{ socket: net.Socket; dataPromise: Promise<Buffer> }> {
    const { dataSocket } = await this.enterPassiveModeRaw(state)
    const dataChunks: Buffer[] = []

    const dataPromise = new Promise<Buffer>((resolveData, rejectData) => {
      dataSocket.on('data', (chunk: Buffer) => {
        dataChunks.push(chunk)
      })
      dataSocket.on('end', () => {
        resolveData(Buffer.concat(dataChunks))
      })
      dataSocket.on('error', rejectData)
      dataSocket.on('close', () => {
        resolveData(Buffer.concat(dataChunks))
      })
    })

    return { socket: dataSocket, dataPromise }
  }

  /**
   * 建立数据连接（被动模式）- 仅获取 socket，用于发送数据（STOR 等）
   */
  private async enterPassiveModeForSend(state: FtpConnectionState): Promise<net.Socket> {
    const { dataSocket } = await this.enterPassiveModeRaw(state)
    return dataSocket
  }

  /**
   * 建立被动模式数据连接的底层实现
   * 如果 PASV 不被服务器支持（502），自动回退到 PORT 主动模式
   */
  private async enterPassiveModeRaw(state: FtpConnectionState): Promise<{ dataSocket: net.Socket }> {
    this.emitData(state, '[FTP] PASV >>> Sending PASV command...')
    const response = await this.sendCommand(state, 'PASV')
    this.emitData(state, `[FTP] PASV <<< ${response.trim()}`)
    const pasvCode = this.parseResponse(response).code

    // 如果服务器不支持 PASV（502 等），回退到 PORT 主动模式
    if (pasvCode >= 400) {
      this.emitData(state, `[FTP] PASV not supported (${pasvCode}), falling back to PORT...`)
      return this.enterActiveModeForSend(state)
    }

    // 解析 PASV 响应: 227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)
    const match = response.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/)
    if (!match) {
      this.emitData(state, `[FTP] PASV response parse failed, falling back to PORT...`)
      return this.enterActiveModeForSend(state)
    }
    const host = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`
    const port = parseInt(match[5]) * 256 + parseInt(match[6])

    this.emitData(state, `[FTP] PASV data channel connecting to ${host}:${port}...`)

    return new Promise((resolve, reject) => {
      const dataSocket = new net.Socket()

      dataSocket.connect(port, host, () => {
        this.emitData(state, `[FTP] PASV data channel connected: ${host}:${port}`)
        resolve({ dataSocket })
      })

      dataSocket.on('error', reject)
    })
  }

  /**
   * 建立主动模式数据连接（PORT 命令）- 用于发送数据（STOR 等）
   * 返回 raw socket，调用方负责写入数据
   */
  private async enterActiveModeForSend(state: FtpConnectionState): Promise<{ dataSocket: net.Socket }> {
    this.emitData(state, '[FTP] PORT >>> Starting local server for active mode...')
    return new Promise((resolve, reject) => {
      const server = net.createServer((dataSocket) => {
        // 不注册 data 监听器，调用方直接通过此 socket 发送数据
        this.emitData(state, '[FTP] PORT <<< Server connected to data channel')
        // 连接建立后关闭 server，避免端口泄露
        server.close()
        resolve({ dataSocket })
      })

      server.listen(0, '0.0.0.0', () => {
        const serverAddr = server.address() as net.AddressInfo
        // PORT 命令必须使用控制连接的实际本地 IP，而非 0.0.0.0
        const localIp = state.controlSocket.localAddress || serverAddr.address
        const ipParts = localIp.split('.').map(Number)
        const portHi = (serverAddr.port >> 8) & 0xff
        const portLo = serverAddr.port & 0xff

        const portCmd = `PORT ${ipParts.join(',')},${portHi},${portLo}`
        this.emitData(state, `[FTP] PORT >>> ${portCmd} (local IP: ${localIp}, port: ${serverAddr.port})`)
        this.sendCommand(state, portCmd)
          .then((resp) => {
            this.emitData(state, `[FTP] PORT <<< ${resp.trim()}`)
          })
          .catch(reject)
      })

      server.on('error', reject)
    })
  }

  // ============ 公共 API ============

  async start(info: ConnectionInfo, onData: any, onClose: any, onLog: any): Promise<object> {
    const sessionId = info.sessionId
    const host = info.host
    const port = info.port || 21
    const username = info.username || 'anonymous'
    const password = info.password || 'anonymous@'

    return new Promise((resolve) => {
      const controlSocket = new net.Socket()

      const state: FtpConnectionState = {
        controlSocket,
        host,
        port,
        username,
        password,
        loggedIn: false,
        currentDir: '/',
        buffer: '',
        pendingResolve: null,
        pendingReject: null,
        onData,
        onClose,
        onLog
      }

      controlSocket.connect(port, host, async () => {
        this.emitData(state, `Connected to ${host}:${port}`)

        // 等待欢迎消息（不通过 sendCommand，因为是服务器主动发送的）
        state.pendingResolve = (welcomeMsg: string) => {
          this.emitData(state, welcomeMsg)
          this.handleLogin(state, sessionId)
            .then((result) => {
              if (result.success) {
                this.connections.set(sessionId, state)
              } else {
                // 认证失败，主动关闭控制连接，防止 socket 泄漏和后续意外 close 事件
                state.onClose = null
                state.controlSocket.removeAllListeners()
                state.controlSocket.destroy()
              }
              resolve(result)
            })
            .catch((err) => {
              state.onClose = null
              state.controlSocket.removeAllListeners()
              state.controlSocket.destroy()
              resolve({ success: false, message: err.message })
            })
        }
      })

      controlSocket.on('data', (data: Buffer) => {
        this.handleControlData(state, data)
      })

      controlSocket.on('error', (err: Error) => {
        this.logger.error(`FTP control connection error: ${err.message}`)
        if (state.pendingReject) {
          state.pendingReject(err)
          state.pendingResolve = null
          state.pendingReject = null
        }
        // 如果还没登录成功，直接返回失败
        if (!state.loggedIn) {
          resolve({ success: false, message: err.message })
        }
      })

      controlSocket.on('close', () => {
        this.logger.info(`FTP control connection closed: ${host}:${port}`)
        this.connections.delete(sessionId)
        state.onClose?.()
      })
    })
  }

  /**
   * 处理 FTP 登录流程
   */
  private async handleLogin(state: FtpConnectionState, sessionId: string): Promise<{ success: boolean; message: string; connId?: string }> {
    try {
      // USER
      const userResp = await this.sendCommand(state, `USER ${state.username}`)
      const userCode = this.parseResponse(userResp).code

      if (userCode >= 400) {
        return { success: false, message: `USER command failed: ${userResp}` }
      }

      // 如果返回 230，表示无需密码直接登录
      if (userCode === 230) {
        state.loggedIn = true
        this.emitData(state, '[FTP] Logged in (no password required)')
        return { success: true, message: 'Connected successfully', connId: sessionId }
      }

      // 需要密码（331 或 332）
      if (userCode === 331 || userCode === 332) {
        const passResp = await this.sendCommand(state, `PASS ${state.password}`)
        const passCode = this.parseResponse(passResp).code

        if (passCode >= 400) {
          return { success: false, message: `PASS command failed: ${passResp}` }
        }

        state.loggedIn = true
        this.emitData(state, '[FTP] Logged in successfully')

        // 查询当前目录
        try {
          const pwdResp = await this.sendCommand(state, 'PWD')
          const pwdMatch = pwdResp.match(/"(.+)"/)
          if (pwdMatch) {
            state.currentDir = pwdMatch[1]
            this.emitData(state, `[FTP] Current directory: ${state.currentDir}`)
          }
        } catch {
          // 忽略 PWD 错误
        }

        return { success: true, message: 'Connected successfully', connId: sessionId }
      }

      return { success: false, message: `Unexpected USER response: ${userResp}` }
    } catch (err) {
      return { success: false, message: (err as Error).message }
    }
  }

  async send(connId: string, command: string, onComplete: any): Promise<object> {
    const state = this.connections.get(connId)
    if (!state) {
      return { success: false, message: 'Connection does not exist' }
    }

    if (!state.loggedIn) {
      return { success: false, message: 'Not logged in' }
    }

    try {
      const parts = command.trim().split(/\s+/)
      const ftpCmd = parts[0].toUpperCase()
      const args = parts.slice(1).join(' ')

      const logPrefix = `[${this.timestamp()}] FTP >>>>>>>>>>>`
      onComplete?.(`${logPrefix} ${command}`)

      // 处理需要数据连接的命令
      switch (ftpCmd) {
        case 'LIST':
        case 'LS': {
          const { socket: dataSocket, dataPromise } = await this.enterPassiveMode(state)
          // 确保数据连接错误不会导致 Promise 永远挂起
          let dataError: Error | null = null
          dataSocket.on('error', (err) => {
            dataError = err
          })
          await this.sendCommand(state, 'LIST')
          const data = await dataPromise
          if (dataError) {
            return { success: false, message: `LIST data channel error: ${(dataError as Error).message}` }
          }
          const listing = data.toString('utf-8')
          this.emitData(state, listing)
          return { success: true, message: 'LIST completed' }
        }

        case 'PWD': {
          const resp = await this.sendCommand(state, 'PWD')
          const match = resp.match(/"(.+)"/)
          if (match) {
            state.currentDir = match[1]
          }
          return { success: true, message: resp }
        }

        case 'CWD':
        case 'CD': {
          if (!args) return { success: false, message: 'Missing directory path' }
          const resp = await this.sendCommand(state, `CWD ${args}`)
          const code = this.parseResponse(resp).code
          if (code >= 400) {
            return { success: false, message: resp }
          }
          // 更新当前目录
          try {
            const pwdResp = await this.sendCommand(state, 'PWD')
            const pwdMatch = pwdResp.match(/"(.+)"/)
            if (pwdMatch) {
              state.currentDir = pwdMatch[1]
            }
          } catch { /* ignore */ }
          return { success: true, message: resp }
        }

        case 'CDUP': {
          const resp = await this.sendCommand(state, 'CDUP')
          return { success: true, message: resp }
        }

        case 'MKD': {
          if (!args) return { success: false, message: 'Missing directory name' }
          const resp = await this.sendCommand(state, `MKD ${args}`)
          return { success: true, message: resp }
        }

        case 'RMD': {
          if (!args) return { success: false, message: 'Missing directory name' }
          const resp = await this.sendCommand(state, `RMD ${args}`)
          return { success: true, message: resp }
        }

        case 'DELE':
        case 'RM': {
          if (!args) return { success: false, message: 'Missing file name' }
          const resp = await this.sendCommand(state, `DELE ${args}`)
          return { success: true, message: resp }
        }

        case 'RNFR':
        case 'RNTO': {
          if (!args) return { success: false, message: 'Missing argument' }
          const resp = await this.sendCommand(state, `${ftpCmd} ${args}`)
          return { success: true, message: resp }
        }

        case 'NOOP': {
          const resp = await this.sendCommand(state, 'NOOP')
          return { success: true, message: resp }
        }

        case 'SYST': {
          const resp = await this.sendCommand(state, 'SYST')
          return { success: true, message: resp }
        }

        case 'FEAT': {
          const resp = await this.sendCommand(state, 'FEAT')
          return { success: true, message: resp }
        }

        case 'TYPE': {
          const resp = await this.sendCommand(state, `TYPE ${args || 'A'}`)
          return { success: true, message: resp }
        }

        case 'QUIT':
        case 'EXIT':
        case 'BYE': {
          try { await this.sendCommand(state, 'QUIT') } catch { /* ignore */ }
          state.controlSocket.destroy()
          return { success: true, message: 'Disconnected' }
        }

        default: {
          // 对于未知命令，直接发送原始命令
          const resp = await this.sendCommand(state, command.trim())
          return { success: true, message: resp }
        }
      }
    } catch (err) {
      const error = err as Error
      this.logger.error(`FTP send failed: ${error.message}`)
      return { success: false, message: error.message }
    }
  }

  async disconnect(connId: string): Promise<object> {
    const state = this.connections.get(connId)
    if (state) {
      try {
        state.controlSocket.removeAllListeners()
        state.controlSocket.destroy()
      } catch { /* ignore */ }
      this.connections.delete(connId)
    }
    return { success: true }
  }

  /**
   * 上传本地文件到 FTP 服务器（流式读取，不占内存）
   * @param connId 连接 ID
   * @param localFilePath 本地文件路径
   * @param remoteFileName 目标文件名
   * @param onData 数据回调（进度实时推送到前端）
   * @param onLog 日志回调
   */
  async uploadFile(
    connId: string,
    localFilePath: string,
    remoteFileName: string,
    onData: (dataObj: { data: string; timestamp: string }) => void,
    onLog: (logStr: string, timestamp: string) => void
  ): Promise<object> {
    const state = this.connections.get(connId)
    if (!state) {
      return { success: false, message: 'Connection does not exist' }
    }
    if (!state.loggedIn) {
      return { success: false, message: 'Not logged in' }
    }

    // 保存原始回调，上传期间临时替换为专用回调
    const origOnData = state.onData
    const origOnLog = state.onLog
    state.onData = onData
    state.onLog = onLog

    const ts = () => this.timestamp()

    const emitLog = (msg: string) => {
      this.logger.info(msg)
      onLog(msg, ts())
      onData({ data: msg, timestamp: ts() })
    }

    try {
      // 检查文件是否存在并获取大小
      const fileStat = fs.statSync(localFilePath)
      if (!fileStat.isFile()) {
        return { success: false, message: `Not a file: ${localFilePath}` }
      }
      const totalBytes = fileStat.size
      const displayName = path.basename(localFilePath)

      emitLog(`[FTP upload] Starting upload: ${displayName} -> ${remoteFileName}, size=${totalBytes} bytes (${(totalBytes / 1024).toFixed(1)} KB)`)

      // 切换到二进制模式
      emitLog(`[FTP upload] Setting TYPE I (binary mode)`)
      const typeResp = await this.sendCommand(state, 'TYPE I')
      emitLog(`[FTP upload] TYPE I response: ${typeResp.trim()}`)

      // 尝试被动模式，失败则回退到主动模式
      let dataSocket: net.Socket
      let storFinalPromise: Promise<string>  // 等待 226 Transfer complete

      try {
        emitLog(`[FTP upload] Trying PASV (passive mode)...`)
        dataSocket = await this.enterPassiveModeForSend(state)
        emitLog(`[FTP upload] PASV data channel established`)

        emitLog(`[FTP upload] Sending STOR ${remoteFileName}`)
        // 先等待 150 (Opening data connection)，再开始传输数据
        const readyResp = await this.sendCommand(state, `STOR ${remoteFileName}`)
        emitLog(`[FTP upload] Server ready (150): ${readyResp.trim()}`)
        // 创建新的 Promise 等待最终 226 响应
        storFinalPromise = new Promise<string>((resolve) => {
          const onCtrlData = (data: Buffer) => {
            const text = data.toString('utf-8')
            if (text.includes('226 ')) {
              state.controlSocket.removeListener('data', onCtrlData)
              const lines = text.split('\r\n')
              const line226 = lines.find(l => l.startsWith('226 ')) || text.trim()
              resolve(line226)
            }
          }
          state.controlSocket.on('data', onCtrlData)
        })
      } catch (pasvErr) {
        emitLog(`[FTP upload] PASV failed: ${(pasvErr as Error).message}, falling back to PORT...`)
        const activeResult = await this.enterActiveModeForSend(state)
        dataSocket = activeResult.dataSocket
        emitLog(`[FTP upload] PORT data channel established`)

        emitLog(`[FTP upload] Sending STOR ${remoteFileName}`)
        // 先等待 150 (Opening data connection)，再开始传输数据
        const readyResp = await this.sendCommand(state, `STOR ${remoteFileName}`)
        emitLog(`[FTP upload] Server ready (150): ${readyResp.trim()}`)
        // 创建新的 Promise 等待最终 226 响应
        storFinalPromise = new Promise<string>((resolve) => {
          const onCtrlData = (data: Buffer) => {
            const text = data.toString('utf-8')
            if (text.includes('226 ')) {
              state.controlSocket.removeListener('data', onCtrlData)
              const lines = text.split('\r\n')
              const line226 = lines.find(l => l.startsWith('226 ')) || text.trim()
              resolve(line226)
            }
          }
          state.controlSocket.on('data', onCtrlData)
        })
      }

      // 流式读取文件并通过 data socket 发送，实时报告进度
      emitLog(`[FTP upload] Streaming ${displayName} (${(totalBytes / 1024).toFixed(1)} KB)...`)

      await new Promise<void>((resolve, reject) => {
        const readStream = fs.createReadStream(localFilePath, { highWaterMark: 64 * 1024 }) // 64KB chunks
        let bytesSent = 0
        let lastProgressPercent = -1
        const startTime = Date.now()

        readStream.on('data', (chunk) => {
          const buf = chunk as Buffer
          // 背压控制：如果 socket 缓冲区满则暂停读取
          const canContinue = dataSocket.write(buf)
          bytesSent += buf.length

          // 每 10% 输出一次进度
          const progressPercent = Math.round((bytesSent / totalBytes) * 100)
          const progressStep = Math.floor(progressPercent / 10) * 10
          if (progressStep > lastProgressPercent || bytesSent >= totalBytes) {
            lastProgressPercent = progressStep
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
            const speed = bytesSent / Math.max((Date.now() - startTime) / 1000, 0.1)
            const speedStr = speed > 1024 * 1024
              ? `${(speed / (1024 * 1024)).toFixed(1)} MB/s`
              : `${(speed / 1024).toFixed(1)} KB/s`
            emitLog(
              `[FTP upload] ${progressPercent}% [${'='.repeat(progressStep / 2)}${' '.repeat(50 - progressStep / 2)}] ` +
              `${(bytesSent / 1024).toFixed(0)}/${(totalBytes / 1024).toFixed(0)} KB ${speedStr} ${elapsed}s`
            )
          }

          if (!canContinue) {
            readStream.pause()
            dataSocket.once('drain', () => readStream.resume())
          }
        })

        readStream.on('end', () => {
          emitLog(`[FTP upload] File read complete, closing data channel...`)
          dataSocket.end(() => {
            const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
            emitLog(`[FTP upload] Data channel closed (${totalTime}s total)`)
            resolve()
          })
        })

        readStream.on('error', (err) => {
          emitLog(`[FTP upload] Read error: ${err.message}`)
          dataSocket.destroy()
          reject(err)
        })

        dataSocket.on('error', (err) => {
          readStream.destroy()
          reject(err)
        })
      })

      // 等待 STOR 最终响应（226 Transfer complete）
      emitLog(`[FTP upload] Waiting for STOR final response...`)
      const resp = await storFinalPromise
      emitLog(`[FTP upload] STOR response: ${resp.trim()}`)
      const code = this.parseResponse(resp).code

      if (code >= 400) {
        emitLog(`[FTP upload] STOR failed with code ${code}: ${resp.trim()}`)
        return { success: false, message: resp }
      }

      const successMsg = `[FTP] File uploaded: ${displayName} -> ${remoteFileName} (${(totalBytes / 1024).toFixed(1)} KB)`
      emitLog(successMsg)
      return { success: true, message: resp }
    } catch (err) {
      const error = err as Error
      const errMsg = `[FTP upload] Failed: ${error.message}`
      this.logger.error(errMsg, error)
      emitLog(errMsg)
      return { success: false, message: error.message }
    } finally {
      // 恢复原始回调
      state.onData = origOnData
      state.onLog = origOnLog
    }
  }

  async updateConfig(_connId: string, _config: any): Promise<object> {
    return { success: true, message: 'No config to update for FTP client' }
  }
}
