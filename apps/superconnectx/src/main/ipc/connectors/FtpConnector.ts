/**
 * FtpConnector - FTP 连接管理（Server + Client）
 *
 * 职责：
 * 1. FTP 服务端模式（单例）
 * 2. FTP 客户端模式（每 session 独立实例）
 * 3. uploadFile（FTP 专属）
 */
import ConnectionInfo from '../../protocol/ConnectionInfo'
import ProtocolLogger from '../../utils/ProtocolLogger'
import ConnectionStateManager from './ConnectionStateManager'

export default class FtpConnector {
  private stateManager: ConnectionStateManager
  private logger: ProtocolLogger | null = null

  // FTP 服务端实例（单例，不实现 DirectClient 接口）
  private ftpServer: any = null
  private ftpServerStopping: Promise<void> | null = null

  // FTP 客户端实例（每个 session 独立）
  private ftpClients: Map<string, any> = new Map()

  constructor(stateManager: ConnectionStateManager) {
    this.stateManager = stateManager
  }

  init(
    _winRef: { mainWindow?: { webContents: { send: Function; isDestroyed: Function } } | null },
    _logger: ProtocolLogger
  ): void {
    this.logger = _logger
  }

  // ============ 回调工厂 ============

  private createOnData(sessionId: string) {
    return (dataObj: { data: string; timestamp: string }) => {
      this.stateManager.sendDataToRenderer(sessionId, dataObj.data, dataObj.timestamp, false)
    }
  }

  private createFtpServerOnClose(sessionId: string): () => void {
    return () => {
      this.stateManager.cleanupOnClose(sessionId)
    }
  }

  private createFtpClientOnClose(sessionId: string): () => void {
    return () => {
      this.stateManager.cleanupOnClose(sessionId)
      this.ftpClients.delete(sessionId)
    }
  }

  private createOnLog(sessionId: string) {
    return (logStr: string, timestamp: string) => {
      if (!this.logger) return
      const finalLog = this.stateManager.buildLogContent(sessionId, logStr, timestamp)
      this.logger.appendToConnLog(finalLog, sessionId)
    }
  }

  // ============ 连接管理 ============

  async startConnection(conn: any, connInfo: ConnectionInfo): Promise<object> {
    const sessionId = conn.sessionId

    if (this.stateManager.isFtpServerMode(sessionId)) {
      return this.startFtpServer(conn, connInfo, sessionId)
    } else {
      return this.startFtpClient(conn, connInfo, sessionId)
    }
  }

  private async startFtpServer(_conn: any, connInfo: ConnectionInfo, sessionId: string): Promise<object> {
    // 等待上一个 stop 完成（避免端口占用等竞争问题）
    if (this.ftpServerStopping) {
      await this.ftpServerStopping
      this.ftpServerStopping = null
    }

    const FtpServer = (await import('../../protocol/FtpServer')).default
    if (!this.ftpServer) {
      this.ftpServer = new FtpServer()
    }

    return await this.ftpServer.start(
      connInfo,
      this.createOnData(sessionId),
      this.createFtpServerOnClose(sessionId),
      this.createOnLog(sessionId)
    )
  }

  private async startFtpClient(_conn: any, connInfo: ConnectionInfo, sessionId: string): Promise<object> {
    const FtpClient = (await import('../../protocol/FtpClient')).default
    const client = new FtpClient()
    this.ftpClients.set(sessionId, client)

    return await client.start(
      connInfo,
      this.createOnData(sessionId),
      this.createFtpClientOnClose(sessionId),
      this.createOnLog(sessionId)
    )
  }

  // ============ 数据操作 ============

  async sendData(conn: any, command: string): Promise<object> {
    if (this.stateManager.isFtpServerMode(conn.sessionId)) {
      if (this.ftpServer) {
        return await this.ftpServer.send(conn.sessionId, command)
      }
      return { success: false, message: 'FTP server not running' }
    }

    const client = this.ftpClients.get(conn.sessionId)
    if (client) {
      return await client.send(conn.sessionId, command,
        (dataStr: string) => this.logger?.appendToConnLog(dataStr, conn.sessionId))
    }
    return { success: false, message: 'FTP client not connected' }
  }

  async stopConnection(conn: any): Promise<object> {
    if (this.stateManager.isFtpServerMode(conn.sessionId)) {
      return this.stopFtpServer(conn.sessionId)
    }
    return this.stopFtpClient(conn.sessionId)
  }

  private async stopFtpServer(sessionId: string): Promise<object> {
    if (this.ftpServer) {
      const stopPromise = (async () => {
        try {
          await this.ftpServer!.stop()
        } finally {
          this.ftpServer = null
        }
      })()
      this.ftpServerStopping = stopPromise
      try {
        await stopPromise
      } finally {
        this.ftpServerStopping = null
        this.stateManager.cleanupOnClose(sessionId)
      }
      return { success: true, message: 'FTP server stopped' }
    }
    // _ftpServer 为 null 但 ftpModeMap 仍有记录，清理残留
    this.stateManager.cleanupOnClose(sessionId)
    return { success: true }
  }

  private async stopFtpClient(sessionId: string): Promise<object> {
    const client = this.ftpClients.get(sessionId)
    if (client) {
      const result = await client.disconnect(sessionId)
      this.ftpClients.delete(sessionId)
      return result
    }
    return { success: true }
  }

  async updateConnectionConfig(conn: any, config: any): Promise<object> {
    if (this.stateManager.isFtpServerMode(conn.sessionId)) {
      return { success: true, message: 'Config updated' }
    }
    const client = this.ftpClients.get(conn.sessionId)
    return client?.updateConfig(conn.sessionId, config)
      || { success: true, message: 'Config updated' }
  }

  // ============ FTP 专属：文件上传 ============

  async uploadFile(conn: any, localFilePath: string, remoteFileName: string): Promise<object> {
    const sessionId = conn.sessionId
    const client = this.ftpClients.get(sessionId)
    if (!client) {
      return { success: false, message: 'FTP client not connected' }
    }
    if (typeof client.uploadFile !== 'function') {
      return { success: false, message: 'FTP client does not support file upload' }
    }
    return await client.uploadFile(
      sessionId,
      localFilePath,
      remoteFileName,
      this.createOnData(sessionId),
      this.createOnLog(sessionId)
    )
  }

  // ============ 清理 ============

  /**
   * 应用退出时清理所有 FTP 连接
   */
  async cleanup(): Promise<void> {
    if (this.ftpServer) {
      try { await this.ftpServer.stop() } catch { /* ignore */ }
      this.ftpServer = null
    }
    for (const [sessionId, client] of this.ftpClients) {
      try { await client.disconnect(sessionId) } catch { /* ignore */ }
    }
    this.ftpClients.clear()
  }
}
