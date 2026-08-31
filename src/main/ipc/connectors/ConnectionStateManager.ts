/**
 * ConnectionStateManager - 连接状态管理
 *
 * 职责：
 * 1. 管理 4 个状态 Map（receiveHex, logTimestamp, connectionType, ftpMode）
 * 2. 提供统一的关闭清理方法，消除 IpcConnector 中 4 处重复代码
 */
import { BrowserWindow } from 'electron'
import ProtocolLogger from '../../utils/ProtocolLogger'

export default class ConnectionStateManager {
  private static readonly DATA_FLUSH_INTERVAL_MS = 30
  private static readonly MAX_PENDING_DATA_BYTES = 256 * 1024
  private receiveHexMap = new Map<string, boolean>()
  private logTimestampMap = new Map<string, boolean>()
  private connectionTypeMap = new Map<string, string>()
  private ftpModeMap = new Map<string, string>()

  // 外部依赖（由 IpcConnector 注入）
  private windows: { mainWindow?: BrowserWindow | null } = { mainWindow: undefined }
  private logger: ProtocolLogger | null = null
  private pendingData = new Map<string, { data: string; timestamp: string; isHex: boolean }>()
  private dataFlushTimer: NodeJS.Timeout | null = null

  init(
    winRef: { mainWindow?: BrowserWindow | null },
    _logger: ProtocolLogger
  ): void {
    this.windows = winRef
    this.logger = _logger
  }

  // ============ Map 操作 ============

  setReceiveHex(sessionId: string, value: boolean): void {
    this.receiveHexMap.set(sessionId, value)
  }

  getReceiveHex(sessionId: string): boolean {
    return this.receiveHexMap.get(sessionId) ?? false
  }

  setLogTimestamp(sessionId: string, value: boolean): void {
    this.logTimestampMap.set(sessionId, value)
  }

  getLogTimestamp(sessionId: string): boolean {
    return this.logTimestampMap.get(sessionId) ?? true
  }

  setConnectionType(sessionId: string, value: string): void {
    this.connectionTypeMap.set(sessionId, value)
  }

  getConnectionType(sessionId: string): string | undefined {
    return this.connectionTypeMap.get(sessionId)
  }

  setFtpMode(sessionId: string, value: string): void {
    this.ftpModeMap.set(sessionId, value)
  }

  getFtpMode(sessionId: string): string | undefined {
    return this.ftpModeMap.get(sessionId)
  }

  isFtpServerMode(sessionId: string): boolean {
    return this.ftpModeMap.get(sessionId) === 'server'
  }

  // ============ 统一清理 ============

  /**
   * 连接关闭时的统一清理逻辑（4 处重复代码的合并）
   */
  cleanupOnClose(sessionId: string): void {
    this.flushPendingData(sessionId)
    this.logger?.flushConnLog(sessionId)
    this.receiveHexMap.delete(sessionId)
    this.logTimestampMap.delete(sessionId)
    this.connectionTypeMap.delete(sessionId)
    this.ftpModeMap.delete(sessionId)

    // 通知渲染进程
    const wc = this.windows.mainWindow?.webContents
    if (wc && !wc.isDestroyed()) {
      wc.send('on-connect-close', sessionId)
    }
  }

  /**
   * 构建日志内容（带时间戳控制）
   */
  buildLogContent(sessionId: string, logStr: string, timestamp: string): string {
    const showTimestamp = this.getLogTimestamp(sessionId)
    return showTimestamp && timestamp ? `[${timestamp}] ${logStr}` : logStr
  }

  /**
   * 发送数据到渲染进程
   */
  sendDataToRenderer(sessionId: string, data: string, timestamp: string, isHex: boolean): void {
    const pending = this.pendingData.get(sessionId)
    const wc = this.windows.mainWindow?.webContents
    if (!wc || wc.isDestroyed()) return

    // 保持首包立即送达；后续短时间内到达的数据再合并，避免改变终端首屏时序。
    if (!pending) {
      wc.send('on-recv-data', { connId: sessionId, data, timestamp, isHex })
      return
    }

    const combinedData = pending ? pending.data + data : data
    if (Buffer.byteLength(combinedData, 'utf8') >= ConnectionStateManager.MAX_PENDING_DATA_BYTES) {
      this.pendingData.set(sessionId, { data: combinedData, timestamp, isHex })
      this.flushPendingData(sessionId)
      return
    }

    this.pendingData.set(sessionId, { data: combinedData, timestamp, isHex })
    this.scheduleDataFlush()
  }

  private scheduleDataFlush(): void {
    if (this.dataFlushTimer) return
    this.dataFlushTimer = setTimeout(() => {
      this.dataFlushTimer = null
      for (const sessionId of this.pendingData.keys()) {
        this.flushPendingData(sessionId)
      }
    }, ConnectionStateManager.DATA_FLUSH_INTERVAL_MS)
  }

  private flushPendingData(sessionId: string): void {
    const pending = this.pendingData.get(sessionId)
    if (!pending) return
    this.pendingData.delete(sessionId)

    const wc = this.windows.mainWindow?.webContents
    if (!wc || wc.isDestroyed()) return
    wc.send('on-recv-data', {
      connId: sessionId,
      data: pending.data,
      timestamp: pending.timestamp,
      isHex: pending.isHex
    })
  }

}
