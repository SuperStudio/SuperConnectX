import FtpSrv from 'ftp-srv'
import logger from '../ipc/IpcAppLogger'

// 定义服务端配置类型
interface FtpServerConfig {
  host: string // 监听地址（如 0.0.0.0 监听所有网卡）
  port: number // 监听端口（默认 21）
  root: string // FTP 根目录（本地文件路径）
  pasv_url?: string // 被动模式地址（外网访问需配置）
  credentials?: {
    // 用户名密码（可选，默认匿名）
    [username: string]: string
  }
}

// 定义客户端连接实例类型
interface FtpClientConnection {
  context: any // 客户端上下文
  id: string // 连接ID
  onData: (data: string) => void // 数据回调
  onClose: () => void // 连接关闭回调
}

export default class FtpServer {
  private server: InstanceType<typeof FtpSrv> | null = null // FTP 服务实例
  private connections: Map<string, FtpClientConnection> = new Map() // 客户端连接列表

  /**
   * 启动 FTP 服务（替代原 start 方法）
   * @param config 服务端配置
   * @param onClientConnect 新客户端连接回调
   * @returns 启动是否成功
   */
  async start(
    config: FtpServerConfig,
    onClientConnect?: (clientId: string) => void,
    onClientClose?: (clientId: string) => void
  ): Promise<object> {
    try {
      // 若已启动，先停止
      if (this.server) {
        await this.disconnectAll()
      }

      // 初始化 FTP 服务端
      this.server = new FtpSrv({
        url: `ftp://${config.host}:${config.port}`,
        pasv_url: config.pasv_url || config.host
      })

      // 监听客户端连接事件
      this.server.on('login', (context: any) => {
        const clientId = this.generateClientId(context)
        logger.info(`FTP client connected: ${clientId} (${context.connection.remoteAddress})`)

        // 保存客户端连接
        const connection: FtpClientConnection = {
          context,
          id: clientId,
          onData: () => {}, // 初始空回调，可动态赋值
          onClose: () => {} // 初始空回调，可动态赋值
        }
        this.connections.set(clientId, connection)

        // 监听客户端命令
        context.on('CMD', (command: string, params: string[]) => {
          const logMsg = `Client ${clientId} send command: ${command} ${params.join(' ')}`
          logger.info(logMsg)
          // 触发数据回调（传递命令信息）
          connection.onData(logMsg + '\n')
        })

        // 监听客户端断开事件
        context.connection.on('close', () => {
          logger.info(`FTP client disconnected: ${clientId}`)
          connection.onClose()
          this.connections.delete(clientId)
          onClientClose?.(clientId)
        })

        // 触发新连接回调
        onClientConnect?.(clientId)
      })

      // 启动服务监听
      await this.server.listen()
      logger.info(`FTP server started: ftp://${config.host}:${config.port}, root: ${config.root}`)
      return { success: true }
    } catch (err) {
      const error = err as Error
      logger.error(`FTP server start error: ${error.message}`)
      throw new Error(`Failed to start FTP server: ${error.message}`)
    }
  }

  /**
   * 向指定客户端发送数据/响应命令（替代原 send 方法）
   * @param clientId 客户端连接ID
   * @param data 要发送的数据（字符串/命令响应）
   * @returns 发送是否成功
   */
  async send(clientId: string, data: string): Promise<object> {
    const connection = this.connections.get(clientId)
    if (!connection) {
      logger.error(`FTP client not found: ${clientId}`)
      return { success: false, message: `Client ${clientId} not connected` }
    }

    try {
      // 方式1：直接触发客户端的 onData 回调（传递自定义数据）
      connection.onData(`Server response: ${data}\n`)

      // 方式2：主动向客户端连接写入数据（底层 socket 方式）
      connection.context.connection.write(`${data}\r\n`)
      logger.info(`Sent data to client ${clientId}: ${data}`)
      return { success: true }
    } catch (err) {
      const error = err as Error
      logger.error(`Failed to send data to client ${clientId}: ${error.message}`)
      return { success: false, message: `Send data failed: ${error.message}` }
    }
  }

  /**
   * 断开指定客户端连接（替代原 disconnect 方法）
   * @param clientId 客户端连接ID
   * @returns 断开是否成功
   */
  async disconnect(clientId: string): Promise<object> {
    const connection = this.connections.get(clientId)
    if (!connection) {
      return { success: false, message: `Client ${clientId} not found` }
    }

    try {
      // 关闭客户端连接
      connection.context.connection.end()
      logger.info(`Disconnected FTP client: ${clientId}`)
    } catch (err) {
      const error = err as Error
      logger.error(`Failed to disconnect client ${clientId}: ${error.message}`)
    } finally {
      this.connections.delete(clientId)
    }
    return { success: true }
  }

  /**
   * 停止 FTP 服务并断开所有客户端连接
   * @returns 停止是否成功
   */
  async disconnectAll(): Promise<object> {
    if (!this.server) {
      return { success: false, message: 'Server not running' }
    }

    try {
      // 断开所有客户端连接
      Array.from(this.connections.keys()).forEach((clientId) => {
        this.disconnect(clientId)
      })

      // 停止服务监听
      await this.server.close()
      this.server = null
      logger.info('FTP server stopped and all clients disconnected')
      return { success: true }
    } catch (err) {
      const error = err as Error
      logger.error(`Failed to stop FTP server: ${error.message}`)
      return { success: false, message: `Stop server failed: ${error.message}` }
    }
  }

  /**
   * 获取当前连接的客户端列表
   * @returns 客户端ID列表
   */
  getConnectedClients(): string[] {
    return Array.from(this.connections.keys())
  }

  /**
   * 生成唯一客户端ID
   * @param context 客户端上下文
   * @returns 唯一ID
   */
  private generateClientId(context: any): string {
    const remoteAddr = context.connection?.remoteAddress?.replace(/:/g, '-') || 'unknown'
    const timestamp = Date.now().toString().slice(-6)
    return `${remoteAddr}-${timestamp}`
  }
}
