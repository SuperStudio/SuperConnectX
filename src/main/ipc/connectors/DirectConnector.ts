/**
 * DirectConnector - COM/Telnet 直连模式
 *
 * 职责：在主线程中管理 COM 和 Telnet 的直连客户端
 * 适用于无法走 Worker 线程的场景（如 serialport native addon）
 */
import ConnectionInfo from '../../protocol/ConnectionInfo'
import ProtocolLogger from '../../utils/ProtocolLogger'
import ConnectionStateManager from './ConnectionStateManager'
import type { SessionLifecycleRef } from '../../services/types/RuntimeTypes'

interface DirectClient {
  start(
    info: ConnectionInfo,
    onData: (dataObj: { data: string; timestamp: string }) => void,
    onClose: () => void,
    onLog: (logStr: string, timestamp: string) => void
  ): Promise<object>
  send(sessionId: string, command: string, onComplete: (dataStr: string) => void): Promise<object>
  disconnect(sessionId: string): Promise<object>
  updateConfig(sessionId: string, config: Record<string, unknown>): Promise<object>
}

interface DirectClientEntry {
  client: DirectClient
  lifecycle: SessionLifecycleRef
}

export default class DirectConnector {
  private stateManager: ConnectionStateManager
  private logger: ProtocolLogger | null = null

  // 直连模式客户端实例（每个 session 独立实例，避免 onData/onClose 回调覆盖）
  private directClients: Map<string, DirectClientEntry> = new Map()

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

  private isCurrent(entry: DirectClientEntry): boolean {
    return this.directClients.get(entry.lifecycle.sessionId) === entry
  }

  private createOnData(entry: DirectClientEntry) {
    return (dataObj: { data: string; timestamp: string }) => {
      if (!this.isCurrent(entry)) return
      const sessionId = entry.lifecycle.sessionId
      const isHex = this.stateManager.getReceiveHex(sessionId)
      // HEX 转换已下沉到 BufferLineSplitter.decodeBuffer() 中完成，此处不再重复转换
      this.stateManager.sendDataToRenderer(sessionId, dataObj.data, dataObj.timestamp, isHex)
    }
  }

  private createOnClose(entry: DirectClientEntry): () => void {
    return () => {
      if (!this.isCurrent(entry)) return
      this.directClients.delete(entry.lifecycle.sessionId)
      this.stateManager.notifyBackendClosed(entry.lifecycle)
    }
  }

  private createOnLog(entry: DirectClientEntry) {
    return (logStr: string, timestamp: string) => {
      if (!this.logger || !this.isCurrent(entry)) return
      const sessionId = entry.lifecycle.sessionId
      const finalLog = this.stateManager.buildLogContent(sessionId, logStr, timestamp)
      this.logger.appendToConnLog(finalLog, sessionId)
    }
  }

  // ============ 连接管理 ============

  async startConnection(
    conn: any,
    connInfo: ConnectionInfo,
    lifecycle: SessionLifecycleRef = { sessionId: String(conn.sessionId), generation: 0 }
  ): Promise<object> {
    const sessionId = lifecycle.sessionId

    const ComClient = (await import('../../protocol/ComClient')).default
    const TelnetClient = (await import('../../protocol/TelnetClient')).default

    const ClientClass = conn.connectionType === 'com' ? ComClient : TelnetClient
    const client = new ClientClass()
    const entry = { client, lifecycle }
    this.directClients.set(sessionId, entry)

    try {
      const result = await client.start(
        connInfo,
        this.createOnData(entry),
        this.createOnClose(entry),
        this.createOnLog(entry)
      )
      if ((result as { success?: boolean }).success === false && this.isCurrent(entry)) {
        this.directClients.delete(sessionId)
      }
      return result
    } catch (error) {
      if (this.isCurrent(entry)) this.directClients.delete(sessionId)
      throw error
    }
  }

  async sendData(conn: any, command: string): Promise<object> {
    const entry = this.directClients.get(conn.sessionId)
    if (!entry) return { success: false, message: 'Direct mode client not initialized' }
    return await entry.client.send(conn.sessionId, command, (dataStr: string) =>
      this.logger?.appendToConnLog(dataStr, conn.sessionId)
    )
  }

  async stopConnection(conn: any): Promise<object> {
    const entry = this.directClients.get(conn.sessionId)
    if (!entry) return { success: true }
    const result = await entry.client.disconnect(conn.sessionId)
    if (this.isCurrent(entry)) this.directClients.delete(conn.sessionId)
    return result || { success: true }
  }

  async updateConnectionConfig(conn: any, config: any): Promise<object> {
    const entry = this.directClients.get(conn.sessionId)
    if (!entry) return { success: false, message: 'Direct mode client not initialized' }
    return await entry.client.updateConfig(conn.sessionId, config)
  }
}
