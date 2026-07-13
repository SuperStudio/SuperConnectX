/**
 * IpcConnector - IPC 连接协调器（瘦身后）
 *
 * 职责：
 * 1. 注册所有 IPC Handler
 * 2. 根据连接类型路由到 Worker / Direct / FTP 连接器
 * 3. 不包含具体的连接逻辑
 */
import { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import logger from './IpcAppLogger'
import ProtocolLogger from '../utils/ProtocolLogger'
import SettingsStorage from '../storage/SettingsStorage'
import ConnectionStorage from '../storage/ConnectionStorage'
import WorkerConnector from './connectors/WorkerConnector'
import DirectConnector from './connectors/DirectConnector'
import FtpConnector from './connectors/FtpConnector'
import ConnectionStateManager from './connectors/ConnectionStateManager'
import path from 'path'
import { getAppDataDir } from '../utils/AppDir'

export default class IpcConnector {
  private static sInstance: IpcConnector

  private stateManager: ConnectionStateManager
  private workerConnector: WorkerConnector
  private directConnector: DirectConnector
  private ftpConnector: FtpConnector

  private settingsStorage: SettingsStorage
  private connectionStorage: ConnectionStorage
  private windows!: { mainWindow?: BrowserWindow | null }
  private _logger: ProtocolLogger | null = null

  // 是否启用 Worker 模式（可通过设置切换，默认启用）
  private useWorkerMode: boolean = true

  constructor() {
    this.settingsStorage = new SettingsStorage()
    this.connectionStorage = new ConnectionStorage()

    this.stateManager = new ConnectionStateManager()
    this.workerConnector = new WorkerConnector()
    this.directConnector = new DirectConnector(this.stateManager)
    this.ftpConnector = new FtpConnector(this.stateManager)
  }

  static getInstance(): IpcConnector {
    if (IpcConnector.sInstance == null) {
      IpcConnector.sInstance = new IpcConnector()
    }
    return IpcConnector.sInstance
  }

  init(_logger: ProtocolLogger, winRef: { mainWindow?: BrowserWindow | null }): void {
    this.windows = winRef
    this._logger = _logger

    // 初始化子模块
    this.stateManager.init(winRef, _logger)
    this.directConnector.init(winRef, _logger)
    this.ftpConnector.init(winRef, _logger)

    // 设置 Worker 池回调（Worker 模式下的数据/日志/关闭路由）
    this.workerConnector.setCallbacks(
      (sessionId: string, displayData: string, timestamp: string, isHex: boolean) => {
        this.stateManager.sendDataToRenderer(sessionId, displayData, timestamp, isHex)
      },
      (sessionId: string, logStr: string, timestamp: string) => {
        if (!this._logger) return
        const finalLog = this.stateManager.buildLogContent(sessionId, logStr, timestamp)
        this._logger.appendToConnLog(finalLog, sessionId)
      },
      (sessionId: string) => {
        this.stateManager.cleanupOnClose(sessionId)
        // 同步清理 ftpClients（若存在）
        // FTP cleanup 由 ftpConnector 内部管理，此处通过 stateManager 统一通知即可
      }
    )

    // 设置日志分片回调
    _logger.setLogSplitCallback((connId, oldFileName, newFileName) => {
      this.windows.mainWindow?.webContents.send('on-log-split', {
        connId, oldFileName, newFileName
      })
    })

    // 根据设置更新日志配置
    this.applyLogSettings()

    // ============ 注册 IPC Handler ============
    this.registerIpcHandlers()

    logger.info(`init IpcConnector done (Worker mode: ${this.useWorkerMode})`)
  }

  // ============ IPC Handler 注册 ============

  private registerIpcHandlers(): void {
    const _logger = this._logger!

    // start-connect
    ipcMain.handle('start-connect', async (_, conn: any) => {
      logger.info(`start connect: ${conn.name} (type: ${conn.connectionType})`)
      const debugConn = { ...conn }
      if (debugConn.password) debugConn.password = '***'
      logger.debug(JSON.stringify(debugConn))
      _logger.createConnLogFile(String(conn.sessionId), conn.name, conn.remark || '')
      this.initConnectionState(conn)
      return this.routeStart(conn)
    })

    // start-connect-by-id（从存储中解密密码）
    ipcMain.handle('start-connect-by-id', async (_, { id, sessionId, extraFields }: { id: number; sessionId: string | number; extraFields?: any }) => {
      logger.info(`start connect by id: ${id}, sessionId: ${sessionId}`)
      const storedConn = this.connectionStorage.getByIdWithPassword(id)
      if (!storedConn) {
        logger.error(`connection not found for id: ${id}`)
        return { success: false, message: `连接不存在 (id: ${id})` }
      }
      // sessionId 统一为 string（ProtocolLogger 的 Map key 都是 string 类型）
      const normalizedSessionId = String(sessionId)
      const conn = { ...(extraFields || {}), ...storedConn, sessionId: normalizedSessionId }
      if (storedConn.password) {
        conn.password = storedConn.password
      }
      const debugConn = { ...conn }
      if (debugConn.password) debugConn.password = '***'
      logger.debug(`start-connect-by-id conn: ${JSON.stringify(debugConn)}`)
      _logger.createConnLogFile(normalizedSessionId, conn.name, conn.remark || '')
      this.initConnectionState(conn)
      return this.routeStart(conn)
    })

    // send-data
    ipcMain.handle('send-data', async (_, { conn, command }: { conn: any; command: string }) => {
      return this.routeSend(conn, command)
    })

    // upload-file
    ipcMain.handle('upload-file', async (_, { conn, localFilePath, remoteFileName }: { conn: any; localFilePath: string; remoteFileName: string }) => {
      if (conn.connectionType !== 'ftp') {
        return { success: false, message: 'File upload only supported for FTP connections' }
      }
      return this.ftpConnector.uploadFile(conn, localFilePath, remoteFileName)
    })

    // stop-connect
    ipcMain.handle('stop-connect', async (_, conn: any) => {
      return this.routeStop(conn)
    })

    // update-connect
    ipcMain.handle('update-connect', async (_, { conn, config }: { conn: any; config: any }) => {
      const connLabel = conn.comName || conn.host || conn.name || conn.sessionId
      logger.info(`update connect config: ${connLabel}, sessionId: ${conn.sessionId}`)

      if (config.receiveHex !== undefined) {
        const isHex = config.receiveHex === true || config.receiveHex === 'true'
        this.stateManager.setReceiveHex(conn.sessionId, isHex)
        return this.routeUpdate(conn, { receiveHex: isHex })
      }

      if (config.logTimestamp !== undefined) {
        const showTimestamp = config.logTimestamp === true || config.logTimestamp === 'true'
        this.stateManager.setLogTimestamp(conn.sessionId, showTimestamp)
        logger.info(`update logTimestamp: ${showTimestamp} for sessionId: ${conn.sessionId}`)
        if (this.workerConnector.shouldUseWorker(conn, this.useWorkerMode)) {
          return this.workerConnector.updateConnectionConfig(conn, { logTimestamp: showTimestamp })
        }
        return { success: true, message: 'Updated successfully' }
      }

      return this.routeUpdate(conn, config)
    })

    // 日志相关 IPC
    ipcMain.handle('open-connect-log', async (_, sessionId: string, mode: 'folder' | 'file' = 'folder') => {
      logger.info(`open log (mode=${mode}): ${sessionId}`)
      if (sessionId) {
        return await _logger.openConnLog(sessionId, mode)
      }
      return await _logger.openLogDir()
    })

    ipcMain.handle('get-log-file-path', async (_, sessionId: string) => {
      return await _logger.getLogFilePath(sessionId)
    })

    ipcMain.handle('copy-log-file', async (_, { sessionId, destPath }: { sessionId: string; destPath: string }) => {
      return await _logger.copyLogFile(sessionId, destPath)
    })

    ipcMain.handle('rotate-log-file', async (_, sessionId: string) => {
      return await _logger.rotateLogFile(sessionId)
    })

    ipcMain.handle('write-to-log', async (_, { sessionId, content }: { sessionId: string; content: string }) => {
      _logger.appendToConnLog(content, sessionId)
      return { success: true }
    })

    // Worker 模式开关
    ipcMain.handle('get-worker-pool-status', async () => {
      return this.workerConnector.getStatus()
    })

    ipcMain.handle('set-worker-mode', async (_, enabled: boolean) => {
      this.useWorkerMode = enabled
      logger.info(`Worker mode ${enabled ? 'enabled' : 'disabled'}`)
      return { success: true }
    })
  }

  // ============ 路由方法 ============

  private routeStart(conn: any): Promise<object> | object {
    if (this.workerConnector.shouldUseWorker(conn, this.useWorkerMode)) {
      return this.workerConnector.startConnection(conn)
    }
    if (conn.connectionType === 'ftp') {
      return this.ftpConnector.startConnection(conn, this.workerConnector.buildConnectInfo(conn))
    }
    return this.directConnector.startConnection(conn, this.workerConnector.buildConnectInfo(conn))
  }

  private routeSend(conn: any, command: string): Promise<object> | object {
    if (this.workerConnector.shouldUseWorker(conn, this.useWorkerMode)) {
      return this.workerConnector.sendData(conn, command)
    }
    if (conn.connectionType === 'ftp') {
      return this.ftpConnector.sendData(conn, command)
    }
    return this.directConnector.sendData(conn, command)
  }

  private routeStop(conn: any): Promise<object> | object {
    if (this.workerConnector.shouldUseWorker(conn, this.useWorkerMode)) {
      return this.workerConnector.stopConnection(conn)
    }
    if (conn.connectionType === 'ftp') {
      return this.ftpConnector.stopConnection(conn)
    }
    return this.directConnector.stopConnection(conn)
  }

  private routeUpdate(conn: any, config: any): Promise<object> | object {
    if (this.workerConnector.shouldUseWorker(conn, this.useWorkerMode)) {
      return this.workerConnector.updateConnectionConfig(conn, config)
    }
    if (conn.connectionType === 'ftp') {
      return this.ftpConnector.updateConnectionConfig(conn, config)
    }
    return this.directConnector.updateConnectionConfig(conn, config)
  }

  // ============ 状态初始化 ============

  private initConnectionState(conn: any): void {
    const sessionId = conn.sessionId
    const receiveHex = conn.receiveHex === true || conn.receiveHex === 'true'
    this.stateManager.setReceiveHex(sessionId, receiveHex)
    const logTimestamp = conn.logTimestamp !== undefined
      ? (conn.logTimestamp === true || conn.logTimestamp === 'true')
      : true
    this.stateManager.setLogTimestamp(sessionId, logTimestamp)
    this.stateManager.setConnectionType(sessionId, conn.connectionType)
    if (conn.connectionType === 'ftp' && conn.ftpMode) {
      this.stateManager.setFtpMode(sessionId, conn.ftpMode)
    }
  }

  // ============ 日志设置应用 ============

  private applyLogSettings(): void {
    const _logger = this._logger!
    const settings = this.settingsStorage.getSettings()
    if (settings.logSplitSize) {
      _logger.setLogSplitSize(settings.logSplitSize)
    }
    _logger.setEnableLogStorage(settings.enableLogStorage === true)

    if (!settings.logPath) {
      const defaultLogPath = path.join(getAppDataDir(), 'logs')
      settings.logPath = defaultLogPath
      this.settingsStorage.saveSettings({ logPath: defaultLogPath })
    }
    _logger.setLogDir(settings.logPath)

    if (settings.logFileName) {
      _logger.setLogFileName(settings.logFileName)
    }
  }

  // ============ 对外接口 ============

  applySettings(settings: { logSplitSize?: number; enableLogStorage?: boolean; logPath?: string; logFileName?: string }): void {
    if (settings.logSplitSize && this._logger) {
      this._logger.setLogSplitSize(settings.logSplitSize)
    }
    if (settings.enableLogStorage !== undefined && this._logger) {
      this._logger.setEnableLogStorage(settings.enableLogStorage)
    }
    if (settings.logPath !== undefined && this._logger) {
      this._logger.setLogDir(settings.logPath)
    }
    if (settings.logFileName !== undefined && this._logger) {
      this._logger.setLogFileName(settings.logFileName)
    }
  }

  /**
   * 应用退出时清理所有连接
   */
  async cleanup(): Promise<void> {
    await this.ftpConnector.cleanup()
    await this.workerConnector.shutdown()
  }
}
