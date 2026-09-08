/**
 * DirectConnector - COM/Telnet 直连模式
 *
 * 职责：在主线程中管理 COM 和 Telnet 的直连客户端
 * 适用于无法走 Worker 线程的场景（如 serialport native addon）
 */
import ConnectionInfo from '../../protocol/ConnectionInfo'
import ProtocolLogger from '../../utils/ProtocolLogger'
import ConnectionStateManager from './ConnectionStateManager'

interface DirectClient {
  start(info: ConnectionInfo, onData: (dataObj: { data: string; timestamp: string }) => void, onClose: () => void, onLog: (logStr: string, timestamp: string) => void): Promise<object>
  send(sessionId: string, command: string, onComplete: (dataStr: string) => void): Promise<object>
  disconnect(sessionId: string): Promise<object>
  updateConfig(sessionId: string, config: Record<string, unknown>): Promise<object>
}

export default class DirectConnector {
  private stateManager: ConnectionStateManager
  private logger: ProtocolLogger | null = null

  // 直连模式客户端实例（每个 session 独立实例，避免 onData/onClose 回调覆盖）
  private directClients: Map<string, DirectClient> = new Map()
  private pendingStarts: Map<string, Set<Promise<object>>> = new Map()
  private startQueues: Map<string, Promise<void>> = new Map()
  private generations: Map<string, number> = new Map()

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

  private createOnData(sessionId: string, client: DirectClient) {
    return (dataObj: { data: string; timestamp: string }) => {
      if (this.directClients.get(sessionId) !== client) return
      const isHex = this.stateManager.getReceiveHex(sessionId)
      // HEX 转换已下沉到 BufferLineSplitter.decodeBuffer() 中完成，此处不再重复转换
      this.stateManager.sendDataToRenderer(sessionId, dataObj.data, dataObj.timestamp, isHex)
    }
  }

  private createOnClose(sessionId: string, client: DirectClient): () => void {
    return () => {
      if (this.directClients.get(sessionId) !== client) return
      this.stateManager.cleanupOnClose(sessionId)
      this.directClients.delete(sessionId)
    }
  }

  private createOnLog(sessionId: string, client: DirectClient) {
    return (logStr: string, timestamp: string) => {
      if (!this.logger || this.directClients.get(sessionId) !== client) return
      const finalLog = this.stateManager.buildLogContent(sessionId, logStr, timestamp)
      this.logger.appendToConnLog(finalLog, sessionId)
    }
  }

  // ============ 连接管理 ============

  async startConnection(conn: any, connInfo: ConnectionInfo): Promise<object> {
    const sessionId = conn.sessionId
    const generation = (this.generations.get(sessionId) ?? 0) + 1
    this.generations.set(sessionId, generation)
    const previousQueue = this.startQueues.get(sessionId) ?? Promise.resolve()
    let startPromise!: Promise<object>
    startPromise = previousQueue.then(async () => {
      if ((this.generations.get(sessionId) ?? 0) !== generation) {
        return { success: false, message: 'Direct mode start cancelled' }
      }

      const ComClient = (await import('../../protocol/ComClient')).default
      const TelnetClient = (await import('../../protocol/TelnetClient')).default
      const ClientClass = conn.connectionType === 'com' ? ComClient : TelnetClient
      const client = new ClientClass()
      this.directClients.set(sessionId, client)

      const result = await client.start(
        connInfo,
        this.createOnData(sessionId, client),
        this.createOnClose(sessionId, client),
        this.createOnLog(sessionId, client)
      )

      if ((this.generations.get(sessionId) ?? 0) !== generation || this.directClients.get(sessionId) !== client) {
        await client.disconnect(sessionId)
        if (this.directClients.get(sessionId) === client) this.directClients.delete(sessionId)
        return { success: false, message: 'Direct mode start cancelled' }
      }
      return result
    })
    const pending = this.pendingStarts.get(sessionId) ?? new Set<Promise<object>>()
    pending.add(startPromise)
    this.pendingStarts.set(sessionId, pending)
    const queue = startPromise.then(() => undefined, () => undefined)
    this.startQueues.set(sessionId, queue)
    try {
      return await startPromise
    } finally {
      pending.delete(startPromise)
      if (pending.size === 0) this.pendingStarts.delete(sessionId)
      if (this.startQueues.get(sessionId) === queue) this.startQueues.delete(sessionId)
    }
  }

  async sendData(conn: any, command: string): Promise<object> {
    const client = this.directClients.get(conn.sessionId)
    if (!client) return { success: false, message: 'Direct mode client not initialized' }
    return await client.send(
      conn.sessionId, command,
      (dataStr: string) => this.logger?.appendToConnLog(dataStr, conn.sessionId)
    )
  }

  async stopConnection(conn: any): Promise<object> {
    const sessionId = conn.sessionId
    this.generations.set(sessionId, (this.generations.get(sessionId) ?? 0) + 1)
    const pending = this.pendingStarts.get(sessionId)
    const activeStart = pending?.values().next().value as Promise<object> | undefined
    await activeStart?.catch(() => undefined)
    const client = this.directClients.get(sessionId)
    if (!client) return { success: true }
    const result = await client.disconnect(sessionId)
    if (this.directClients.get(sessionId) === client) this.directClients.delete(sessionId)
    return result || { success: true }
  }

  async updateConnectionConfig(conn: any, config: any): Promise<object> {
    const client = this.directClients.get(conn.sessionId)
    if (!client) return { success: false, message: 'Direct mode client not initialized' }
    return await client.updateConfig(conn.sessionId, config)
  }
}
