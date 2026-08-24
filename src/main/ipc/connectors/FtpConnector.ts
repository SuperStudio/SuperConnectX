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
import type { SessionLifecycleRef } from '../../services/types/RuntimeTypes'

interface FtpClientEntry {
  client: any
  lifecycle: SessionLifecycleRef
}

export default class FtpConnector {
  private stateManager: ConnectionStateManager
  private logger: ProtocolLogger | null = null

  // FTP 服务端实例（单例，不实现 DirectClient 接口）
  private ftpServer: any = null
  private ftpServerLifecycle: SessionLifecycleRef | null = null
  private ftpServerStopping: Promise<void> | null = null

  // FTP 客户端实例（每个 session 独立）
  private ftpClients: Map<string, FtpClientEntry> = new Map()

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

  private isCurrentClient(entry: FtpClientEntry): boolean {
    return this.ftpClients.get(entry.lifecycle.sessionId) === entry
  }

  private isCurrentServer(server: any, lifecycle: SessionLifecycleRef): boolean {
    return this.ftpServer === server && this.ftpServerLifecycle === lifecycle
  }

  private createOnData(lifecycle: SessionLifecycleRef, isCurrent: () => boolean) {
    return (dataObj: { data: string; timestamp: string }) => {
      if (!isCurrent()) return
      this.stateManager.sendDataToRenderer(
        lifecycle.sessionId,
        dataObj.data,
        dataObj.timestamp,
        false
      )
    }
  }

  private createFtpServerOnClose(server: any, lifecycle: SessionLifecycleRef): () => void {
    return () => {
      if (!this.isCurrentServer(server, lifecycle)) return
      this.ftpServer = null
      this.ftpServerLifecycle = null
      this.stateManager.notifyBackendClosed(lifecycle)
    }
  }

  private createFtpClientOnClose(entry: FtpClientEntry): () => void {
    return () => {
      if (!this.isCurrentClient(entry)) return
      this.ftpClients.delete(entry.lifecycle.sessionId)
      this.stateManager.notifyBackendClosed(entry.lifecycle)
    }
  }

  private createOnLog(lifecycle: SessionLifecycleRef, isCurrent: () => boolean) {
    return (logStr: string, timestamp: string) => {
      if (!this.logger || !isCurrent()) return
      const finalLog = this.stateManager.buildLogContent(lifecycle.sessionId, logStr, timestamp)
      this.logger.appendToConnLog(finalLog, lifecycle.sessionId)
    }
  }

  // ============ 连接管理 ============

  async startConnection(
    conn: any,
    connInfo: ConnectionInfo,
    lifecycle: SessionLifecycleRef = { sessionId: String(conn.sessionId), generation: 0 }
  ): Promise<object> {
    const sessionId = lifecycle.sessionId

    if (this.stateManager.isFtpServerMode(sessionId)) {
      return this.startFtpServer(conn, connInfo, lifecycle)
    } else {
      return this.startFtpClient(conn, connInfo, lifecycle)
    }
  }

  private async startFtpServer(
    _conn: any,
    connInfo: ConnectionInfo,
    lifecycle: SessionLifecycleRef
  ): Promise<object> {
    // 等待上一个 stop 完成（避免端口占用等竞争问题）
    if (this.ftpServerStopping) {
      await this.ftpServerStopping
      this.ftpServerStopping = null
    }

    const FtpServer = (await import('../../protocol/FtpServer')).default
    if (!this.ftpServer) {
      this.ftpServer = new FtpServer()
    }
    const server = this.ftpServer
    this.ftpServerLifecycle = lifecycle
    const isCurrent = (): boolean => this.isCurrentServer(server, lifecycle)
    try {
      const result = await server.start(
        connInfo,
        this.createOnData(lifecycle, isCurrent),
        this.createFtpServerOnClose(server, lifecycle),
        this.createOnLog(lifecycle, isCurrent)
      )
      if ((result as { success?: boolean }).success === false && isCurrent()) {
        this.ftpServer = null
        this.ftpServerLifecycle = null
      }
      return result
    } catch (error) {
      if (isCurrent()) {
        this.ftpServer = null
        this.ftpServerLifecycle = null
      }
      throw error
    }
  }

  private async startFtpClient(
    _conn: any,
    connInfo: ConnectionInfo,
    lifecycle: SessionLifecycleRef
  ): Promise<object> {
    const FtpClient = (await import('../../protocol/FtpClient')).default
    const client = new FtpClient()
    const entry = { client, lifecycle }
    this.ftpClients.set(lifecycle.sessionId, entry)
    try {
      const result = await client.start(
        connInfo,
        this.createOnData(lifecycle, () => this.isCurrentClient(entry)),
        this.createFtpClientOnClose(entry),
        this.createOnLog(lifecycle, () => this.isCurrentClient(entry))
      )
      if ((result as { success?: boolean }).success === false && this.isCurrentClient(entry)) {
        this.ftpClients.delete(lifecycle.sessionId)
      }
      return result
    } catch (error) {
      if (this.isCurrentClient(entry)) this.ftpClients.delete(lifecycle.sessionId)
      throw error
    }
  }

  // ============ 数据操作 ============

  async sendData(conn: any, command: string): Promise<object> {
    if (this.stateManager.isFtpServerMode(conn.sessionId)) {
      if (this.ftpServer) {
        return await this.ftpServer.send(conn.sessionId, command)
      }
      return { success: false, message: 'FTP server not running' }
    }

    const entry = this.ftpClients.get(conn.sessionId)
    if (entry) {
      return await entry.client.send(conn.sessionId, command, (dataStr: string) =>
        this.logger?.appendToConnLog(dataStr, conn.sessionId)
      )
    }
    return { success: false, message: 'FTP client not connected' }
  }

  async stopConnection(conn: any): Promise<object> {
    if (this.stateManager.isFtpServerMode(conn.sessionId)) {
      return this.stopFtpServer(conn.sessionId)
    }
    return this.stopFtpClient(conn.sessionId)
  }

  private async stopFtpServer(_sessionId: string): Promise<object> {
    if (this.ftpServer) {
      const server = this.ftpServer
      const lifecycle = this.ftpServerLifecycle
      const stopPromise = (async () => {
        try {
          await server.stop()
        } finally {
          if (lifecycle && this.isCurrentServer(server, lifecycle)) {
            this.ftpServer = null
            this.ftpServerLifecycle = null
          }
        }
      })()
      this.ftpServerStopping = stopPromise
      try {
        await stopPromise
      } finally {
        this.ftpServerStopping = null
      }
      return { success: true, message: 'FTP server stopped' }
    }
    // ConnectionService 负责统一完成 Session 和 Renderer 状态清理。
    return { success: true }
  }

  private async stopFtpClient(sessionId: string): Promise<object> {
    const entry = this.ftpClients.get(sessionId)
    if (entry) {
      const result = await entry.client.disconnect(sessionId)
      if (this.isCurrentClient(entry)) this.ftpClients.delete(sessionId)
      return result
    }
    return { success: true }
  }

  async updateConnectionConfig(conn: any, config: any): Promise<object> {
    if (this.stateManager.isFtpServerMode(conn.sessionId)) {
      return { success: true, message: 'Config updated' }
    }
    const entry = this.ftpClients.get(conn.sessionId)
    return (
      entry?.client.updateConfig(conn.sessionId, config) || {
        success: true,
        message: 'Config updated'
      }
    )
  }

  // ============ FTP 专属：文件上传 ============

  async uploadFile(conn: any, localFilePath: string, remoteFileName: string): Promise<object> {
    const sessionId = conn.sessionId
    const entry = this.ftpClients.get(sessionId)
    if (!entry) {
      return { success: false, message: 'FTP client not connected' }
    }
    if (typeof entry.client.uploadFile !== 'function') {
      return { success: false, message: 'FTP client does not support file upload' }
    }
    return await entry.client.uploadFile(
      sessionId,
      localFilePath,
      remoteFileName,
      this.createOnData(entry.lifecycle, () => this.isCurrentClient(entry)),
      this.createOnLog(entry.lifecycle, () => this.isCurrentClient(entry))
    )
  }

  // ============ 清理 ============

  /**
   * 应用退出时清理所有 FTP 连接
   */
  async cleanup(): Promise<void> {
    if (this.ftpServer) {
      try {
        await this.ftpServer.stop()
      } catch {
        /* ignore */
      }
      this.ftpServer = null
      this.ftpServerLifecycle = null
    }
    for (const [sessionId, entry] of this.ftpClients) {
      try {
        await entry.client.disconnect(sessionId)
      } catch {
        /* ignore */
      }
    }
    this.ftpClients.clear()
  }
}
