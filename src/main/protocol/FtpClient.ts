import { FtpSrv, FtpContext, FileSystem } from 'ftp-srv'
import logger from '../ipc/IpcAppLogger'
import BaseClient from './BaseClient'

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
  context: FtpContext // 客户端上下文
  id: string // 连接ID
  onData: (data: string) => void // 数据回调
  onClose: () => void // 连接关闭回调
}

export default class FtpServer extends BaseClient {
  private server: FtpSrv | null = null // FTP 服务实例
  private config: FtpServerConfig | null = null // 服务配置
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
  ): Promise<boolean> {
    try {
      // 若已启动，先停止
      if (this.server) {
        await this.disconnectAll()
      }

      // 保存配置
      this.config = config

      // 初始化 FTP 服务端
      this.server = new FtpSrv({
        url: `ftp://${config.host}:${config.port}`,
        pasv_url: config.pasv_url || config.host,
        root: config.root,
        // 自定义文件系统（可选，默认使用本地文件系统）
        fs: new FileSystem(config.root),
        // 认证逻辑（支持匿名/密码登录）
        authenticate: (username, password) => {
          // 匿名登录
          if (!username || username === 'anonymous') {
            return Promise.resolve({ anonymous: true })
          }
          // 密码验证
          if (config.credentials && config.credentials[username] === password) {
            return Promise.resolve({ user: username })
          }
          // 认证失败
          return Promise.reject(new Error('Authentication failed'))
        }
      })

      // 监听客户端连接事件
      this.server.on('login', (context: FtpContext) => {
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
      return true
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
  async send(clientId: string, data: string): Promise<boolean> {
    const connection = this.connections.get(clientId)
    if (!connection) {
      logger.error(`FTP client not found: ${clientId}`)
      throw new Error(`Client ${clientId} not connected`)
    }

    try {
      // 方式1：直接触发客户端的 onData 回调（传递自定义数据）
      connection.onData(`Server response: ${data}\n`)

      // 方式2：主动向客户端连接写入数据（底层 socket 方式）
      connection.context.connection.write(`${data}\r\n`)
      logger.info(`Sent data to client ${clientId}: ${data}`)
      return true
    } catch (err) {
      const error = err as Error
      logger.error(`Failed to send data to client ${clientId}: ${error.message}`)
      throw new Error(`Send data failed: ${error.message}`)
    }
  }

  /**
   * 断开指定客户端连接（替代原 disconnect 方法）
   * @param clientId 客户端连接ID
   * @returns 断开是否成功
   */
  async disconnect(clientId: string): Promise<boolean> {
    const connection = this.connections.get(clientId)
    if (!connection) {
      return false
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
    return true
  }

  /**
   * 停止 FTP 服务并断开所有客户端连接
   * @returns 停止是否成功
   */
  async disconnectAll(): Promise<boolean> {
    if (!this.server) {
      return false
    }

    try {
      // 断开所有客户端连接
      Array.from(this.connections.keys()).forEach((clientId) => {
        this.disconnect(clientId)
      })

      // 停止服务监听
      await this.server.close()
      this.server = null
      this.config = null
      logger.info('FTP server stopped and all clients disconnected')
      return true
    } catch (err) {
      const error = err as Error
      logger.error(`Failed to stop FTP server: ${error.message}`)
      throw new Error(`Stop server failed: ${error.message}`)
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
  private generateClientId(context: FtpContext): string {
    const remoteAddr = context.connection.remoteAddress?.replace(/:/g, '-') || 'unknown'
    const timestamp = Date.now().toString().slice(-6)
    return `${remoteAddr}-${timestamp}`
  }
}
