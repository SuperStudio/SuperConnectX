/**
 * FtpServer - 独立的 FTP 服务端实现
 *
 * 与客户端协议（telnet/com）的区别：
 * - FTP 服务端是多客户端模式，一个服务端可同时接受多个 FTP 客户端连接
 * - 不走 Worker 线程（ftp-srv 内部有不可序列化对象），在 IpcConnector 直连模式中运行
 * - 通过回调向主线程发送日志/事件信息
 */
import FtpSrv from 'ftp-srv'
import ConnectionInfo from './ConnectionInfo'
import { ILogger } from './BaseClient'

// 定义客户端连接实例类型
interface FtpClientConnection {
  context: any
  id: string
  onData: (data: string) => void
  onClose: () => void
}

export default class FtpServer {
  private server: InstanceType<typeof FtpSrv> | null = null
  private connections: Map<string, FtpClientConnection> = new Map()
  private logger: ILogger
  private _sessionId: string = ''

  // 回调
  private _onData: ((dataObj: { data: string; timestamp: string }) => void) | null = null
  private _onClose: (() => void) | null = null
  private _onLog: ((logStr: string, timestamp: string) => void) | null = null

  constructor(logger?: ILogger) {
    this.logger = logger || console
  }

  /**
   * 生成时间戳字符串
   */
  private timestamp(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`
  }

  /**
   * 触发 onData 回调
   */
  private emitData(data: string): void {
    const ts = this.timestamp()
    if (this._onData) {
      this._onData({ data, timestamp: ts })
    }
    if (this._onLog) {
      this._onLog(data, ts)
    }
  }

  /**
   * 启动 FTP 服务端
   */
  async start(
    info: ConnectionInfo & { ftpDirectory?: string; ftpPermissions?: string[] },
    onData: (dataObj: { data: string; timestamp: string }) => void,
    onClose: () => void,
    onLog?: (logStr: string, timestamp: string) => void
  ): Promise<object> {
    this._onData = onData
    this._onClose = onClose
    this._onLog = onLog || null
    this._sessionId = info.sessionId || ''

    // FTP 服务端始终监听 0.0.0.0（所有网卡），不依赖用户输入的 host
    // host 可能是空字符串、"0000" 等无效值，对于服务端需要固定使用 0.0.0.0
    const host = '0.0.0.0'
    const port = info.port || 21
    const root = (info as any).ftpDirectory || process.cwd()
    const username = info.username || ''
    const password = info.password || ''

    // 确定 PASV URL：优先使用用户配置的 host，未配置则 undefined（由 ftp-srv 自动处理）
    const pasvUrl = this.resolvePasvUrl(info.host)

    try {
      // 若已启动，先停止
      if (this.server) {
        this.emitData('[FTP] Server already running, stopping previous instance...')
        await this.stopServer()
      }

      this.emitData(`[FTP] Initializing FTP server on ${host}:${port}...`)
      this.emitData(`[FTP] PASV URL: ${pasvUrl}`)
      this.emitData(`[FTP] Root directory: ${root}`)

      // 初始化 FTP 服务端
      // 监听 0.0.0.0 意味着接受所有网卡上的连接
      // pasv_url: 用户配置的 host（如 NAT 穿透场景），未配置时 undefined 由 ftp-srv 自动处理
      this.server = new FtpSrv({
        url: `ftp://${host}:${port}`,
        pasv_url: pasvUrl as string | undefined
      })

      this.emitData('[FTP] Server instance created, registering login handler...')

      // 注册单个 login 事件处理器（同时处理认证和客户端连接追踪）
      // 注意：ftp-srv 的 login 事件使用 emitPromise 模式，
      // 回调签名是 (data, resolve, reject)，必须调用 resolve/reject
      this.server.on('login', (data: any, resolve: any, reject: any) => {
        const { connection, username: loginUser, password: loginPass } = data
        const clientId = this.generateClientId(connection)
        const remoteAddr = connection.ip || connection.remoteAddress || 'unknown'

        this.emitData(`[FTP] Login attempt: user="${loginUser}" from ${remoteAddr}`)

        // 认证检查
        if (username && password) {
          if (loginUser !== username || loginPass !== password) {
            const errMsg = `[FTP] Auth failed for ${loginUser} from ${remoteAddr}`
            this.logger.warn(errMsg)
            this.emitData(errMsg)
            reject(new Error('Authentication failed'))
            return
          }
          this.emitData(`[FTP] Auth success for ${loginUser}`)
        } else {
          this.emitData(`[FTP] Anonymous login accepted`)
        }

        // 认证通过，resolve 返回文件系统配置
        resolve({ root: root })
        this.emitData(`[FTP] Login resolved, root=${root}`)

        const connectMsg = `[FTP] Client connected: ${clientId} (${remoteAddr})`
        this.logger.info(connectMsg)
        this.emitData(connectMsg)

        // 保存客户端连接
        const connEntry: FtpClientConnection = {
          context: connection,
          id: clientId,
          onData: () => {},
          onClose: () => {}
        }
        this.connections.set(clientId, connEntry)
        this.emitData(`[FTP] Active clients: ${this.connections.size}`)

        // 监听客户端命令
        connection.on('CMD', (command: string, params: string[]) => {
          const logMsg = `[FTP] Client ${clientId}: ${command} ${params.join(' ')}`
          this.logger.info(logMsg)
          this.emitData(logMsg)
        })

        // 监听文件下载事件（服务端发送数据给客户端）
        connection.on('RETR', (error: Error | null, filePath: string) => {
          if (error) {
            const errMsg = `[FTP] Client ${clientId}: RETR failed for ${filePath}: ${error.message}`
            this.logger.warn(errMsg)
            this.emitData(errMsg)
          } else {
            const okMsg = `[FTP] Client ${clientId}: RETR completed: ${filePath}`
            this.logger.info(okMsg)
            this.emitData(okMsg)
          }
        })

        // 监听文件上传事件（客户端发送数据给服务端）
        connection.on('STOR', (error: Error | null, fileName: string) => {
          if (error) {
            const errMsg = `[FTP] Client ${clientId}: STOR failed for ${fileName}: ${error.message}`
            this.logger.warn(errMsg)
            this.emitData(errMsg)
          } else {
            const okMsg = `[FTP] Client ${clientId}: STOR completed: ${fileName}`
            this.logger.info(okMsg)
            this.emitData(okMsg)
          }
        })

        // 监听文件传输数据流（实时进度）
        // ftp-srv 的文件系统 fs 对象可被包装以追踪读写
        if (connection.fs && !connection.fs._wrapped) {
          connection.fs._wrapped = true
          const origCreateWriteStream = connection.fs.createWriteStream?.bind(connection.fs)
          const origCreateReadStream = connection.fs.createReadStream?.bind(connection.fs)
          if (origCreateWriteStream) {
            connection.fs.createWriteStream = (filePath: string, options: any) => {
              const stream = origCreateWriteStream(filePath, options)
              let written = 0
              const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath
              let lastEmit = 0
              stream.on('data', (chunk: Buffer) => {
                written += chunk.length
                // 每 64KB 输出一次进度，避免刷屏
                if (written - lastEmit >= 64 * 1024) {
                  lastEmit = written
                  this.emitData(`[FTP] Client ${clientId}: STOR ${fileName} received ${(written / 1024).toFixed(1)} KB...`)
                }
              })
              stream.on('finish', () => {
                this.emitData(`[FTP] Client ${clientId}: STOR ${fileName} completed (${(written / 1024).toFixed(1)} KB)`)
              })
              return stream
            }
          }
          if (origCreateReadStream) {
            connection.fs.createReadStream = (filePath: string, options: any) => {
              const stream = origCreateReadStream(filePath, options)
              let sent = 0
              const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath
              let lastEmit = 0
              stream.on('data', (chunk: Buffer) => {
                sent += chunk.length
                if (sent - lastEmit >= 64 * 1024) {
                  lastEmit = sent
                  this.emitData(`[FTP] Client ${clientId}: RETR ${fileName} sent ${(sent / 1024).toFixed(1)} KB...`)
                }
              })
              stream.on('end', () => {
                this.emitData(`[FTP] Client ${clientId}: RETR ${fileName} completed (${(sent / 1024).toFixed(1)} KB)`)
              })
              return stream
            }
          }
        }

        // 监听文件重命名事件
        connection.on('RNTO', (error: Error | null, fileName: string) => {
          if (error) {
            const errMsg = `[FTP] Client ${clientId}: RNTO failed for ${fileName}: ${error.message}`
            this.logger.warn(errMsg)
            this.emitData(errMsg)
          } else {
            const okMsg = `[FTP] Client ${clientId}: RNTO completed: ${fileName}`
            this.logger.info(okMsg)
            this.emitData(okMsg)
          }
        })

        // 监听客户端断开事件
        connection.on('close', () => {
          const disconnectMsg = `[FTP] Client disconnected: ${clientId}`
          this.logger.info(disconnectMsg)
          this.emitData(disconnectMsg)
          connEntry.onClose()
          this.connections.delete(clientId)
          this.emitData(`[FTP] Active clients: ${this.connections.size}`)
        })

        this.emitData(`[FTP] Event listeners registered for ${clientId}`)
      })

      // 监听 server 级别的客户端错误
      this.server.on('client-error', ({ connection, context, error }: any) => {
        const remoteAddr = connection?.ip || connection?.remoteAddress || 'unknown'
        const errMsg = `[FTP] Client error from ${remoteAddr} [${context}]: ${error?.message || error}`
        this.logger.warn(errMsg)
        this.emitData(errMsg)
      })

      // 监听 server 级别的客户端断开
      this.server.on('disconnect', ({ connection, id }: any) => {
        const remoteAddr = connection?.ip || connection?.remoteAddress || 'unknown'
        const discMsg = `[FTP] Server disconnect event: ${id} (${remoteAddr})`
        this.logger.info(discMsg)
        this.emitData(discMsg)
      })

      this.emitData('[FTP] Login handler registered, starting to listen...')

      // 启动服务监听
      await this.server.listen()

      const startMsg = `FTP server started on ftp://${host}:${port}, root: ${root}`
      this.logger.info(startMsg)
      this.emitData(startMsg)
      this.emitData(`[FTP] Server is listening, waiting for client connections...`)

      // 打印权限信息
      const permissions = (info as any).ftpPermissions
      if (permissions && permissions.length > 0) {
        const permMsg = `[FTP] Permissions: ${permissions.join(', ')}`
        this.emitData(permMsg)
      }

      if (username) {
        this.emitData(`[FTP] Authentication enabled (username: ${username})`)
      } else {
        this.emitData(`[FTP] Anonymous access enabled`)
      }

      return { success: true, message: `FTP server started on port ${port}`, connId: this._sessionId }
    } catch (err) {
      const error = err as Error
      const errMsg = `Failed to start FTP server: ${error.message}`
      this.logger.error(errMsg)
      this.emitData(errMsg)
      return { success: false, message: errMsg }
    }
  }

  /**
   * 向指定客户端发送数据
   */
  async send(connId: string, command: string): Promise<object> {
    this.emitData(`[FTP] send() called: connId="${connId}", command="${command}"`)
    this.emitData(`[FTP] Connected clients: ${this.connections.size} [${Array.from(this.connections.keys()).join(', ')}]`)

    // 如果没有指定客户端 ID，广播给所有客户端
    if (!connId || connId === 'broadcast') {
      let sent = 0
      for (const [clientId, connEntry] of this.connections) {
        try {
          if (connEntry.context.commandSocket?.writable) {
            connEntry.context.commandSocket.write(`${command}\r\n`)
            sent++
            this.emitData(`[FTP] Sent to ${clientId}: ${command}`)
          } else {
            this.emitData(`[FTP] Socket not writable for ${clientId}`)
          }
        } catch (err) {
          this.logger.error(`Failed to send to client ${clientId}: ${(err as Error).message}`)
          this.emitData(`[FTP] Failed to send to ${clientId}: ${(err as Error).message}`)
        }
      }
      return { success: true, message: `Sent to ${sent} clients` }
    }

    const connEntry = this.connections.get(connId)
    if (!connEntry) {
      this.emitData(`[FTP] Client ${connId} not found in connections`)
      return { success: false, message: `Client ${connId} not connected` }
    }

    try {
      connEntry.context.commandSocket.write(`${command}\r\n`)
      this.emitData(`[FTP] Sent to ${connId}: ${command}`)
      return { success: true }
    } catch (err) {
      const error = err as Error
      this.emitData(`[FTP] Send to ${connId} failed: ${error.message}`)
      return { success: false, message: `Send failed: ${error.message}` }
    }
  }

  /**
   * 停止 FTP 服务端
   */
  async stop(): Promise<object> {
    return await this.stopServer()
  }

  /**
   * 获取当前连接的客户端列表
   */
  getConnectedClients(): string[] {
    return Array.from(this.connections.keys())
  }

  /**
   * 停止 FTP 服务（内部方法）
   */
  private async stopServer(): Promise<object> {
    if (!this.server) {
      return { success: false, message: 'Server not running' }
    }

    try {
      // 先手动断开 ftp-srv 内部追踪的所有连接（同步清理，避免后续 close 等待）
      const ftpSrv = this.server as any
      if (ftpSrv.connections) {
        const internalIds = Object.keys(ftpSrv.connections)
        for (const id of internalIds) {
          try {
            ftpSrv.disconnectClient(id)
          } catch { /* ignore */ }
        }
      }

      // 断开 FtpServer 自身追踪的客户端连接
      const clientIds = Array.from(this.connections.keys())
      for (const clientId of clientIds) {
        try {
          const connEntry = this.connections.get(clientId)
          if (connEntry) {
            connEntry.context.close(0)
          }
        } catch { /* ignore */ }
        this.connections.delete(clientId)
      }

      this.emitData('[FTP] Server stopping, all clients disconnected')

      // 停止服务监听（带超时保护，防止 ftp-srv 内部 server.close() 因残留连接而挂起）
      const CLOSE_TIMEOUT_MS = 5000
      const closePromise = this.server.close()
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error(`FTP server close timed out after ${CLOSE_TIMEOUT_MS}ms`)), CLOSE_TIMEOUT_MS)
      })

      try {
        await Promise.race([closePromise, timeoutPromise])
      } catch (err) {
        const warnMsg = `FTP server close warning: ${(err as Error).message}, forcing cleanup`
        this.logger.warn(warnMsg)
        this.emitData(warnMsg)
        // 强制关闭底层 net.Server（绕过 ftp-srv 的 close 流程）
        try {
          const rawServer = (this.server as any).server
          if (rawServer && typeof rawServer.close === 'function') {
            rawServer.close()
          }
        } catch { /* ignore */ }
      }

      this.server = null

      const stopMsg = 'FTP server stopped'
      this.logger.info(stopMsg)
      this.emitData(stopMsg)

      // 通知主线程服务已关闭
      if (this._onClose) {
        this._onClose()
      }

      return { success: true, message: 'FTP server stopped' }
    } catch (err) {
      const error = err as Error
      const errMsg = `Failed to stop FTP server: ${error.message}`
      this.logger.error(errMsg)
      this.emitData(errMsg)
      // 确保 server 引用被清理，避免后续 start 时状态混乱
      this.server = null
      // 即使停止失败，也要通知主线程清理 ftpModeMap 等状态
      if (this._onClose) {
        this._onClose()
      }
      return { success: false, message: errMsg }
    }
  }

  /**
   * 解析 PASV URL
   * 优先级：用户配置的 host > undefined（由 ftp-srv 自动处理）
   *
   * 注意：不能自动填充局域网 IP 作为 fallback。
   * 当 FTP 客户端和服务端在同一台机器上通过 127.0.0.1 连接时，
   * 如果 pasv_url 被设为局域网 IP，数据通道连接会失败。
   * undefined 时 ftp-srv 会使用控制连接的实际 local address，
   * 对本地连接返回 127.0.0.1，对远程连接返回对应的网卡 IP，行为正确。
   */
  private resolvePasvUrl(userHost: string): string | undefined {
    // 如果用户配置了有效的 host（非空、非 "0.0.0.0"、非 "0000"），直接使用
    if (userHost && userHost !== '0.0.0.0' && userHost !== '0000') {
      return userHost
    }

    // 未配置时返回 undefined，由 ftp-srv 根据实际连接自动决定
    return undefined
  }

  /**
   * 生成唯一客户端ID
   */
  private generateClientId(connection: any): string {
    const remoteAddr = (connection.ip || connection.remoteAddress || 'unknown').replace(/:/g, '-')
    const timestamp = Date.now().toString().slice(-6)
    return `${remoteAddr}-${timestamp}`
  }
}
