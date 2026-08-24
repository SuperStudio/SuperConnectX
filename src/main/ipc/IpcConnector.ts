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
import ConnectionService from '../services/ConnectionService'
import RuntimeEventHub from '../services/RuntimeEventHub'
import CommandScheduler from '../extensions/ai-control/application/CommandScheduler'
import type { SessionCommandSettings } from '../services/ConnectionService'
import type { SessionLifecycleRef } from '../services/types/RuntimeTypes'

export default class IpcConnector {
  private static sInstance: IpcConnector

  private stateManager: ConnectionStateManager
  private workerConnector: WorkerConnector
  private directConnector: DirectConnector
  private ftpConnector: FtpConnector

  private settingsStorage: SettingsStorage
  private connectionStorage: ConnectionStorage
  private runtimeEventHub: RuntimeEventHub
  private connectionService: ConnectionService
  private readonly commandScheduler = new CommandScheduler()
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
    this.runtimeEventHub = new RuntimeEventHub()
    this.stateManager.setEventHub(this.runtimeEventHub)
    this.connectionService = new ConnectionService(
      {
        start: (conn, lifecycle) => Promise.resolve(this.routeStart(conn, lifecycle)),
        send: (conn, command) => Promise.resolve(this.routeSend(conn, command)),
        stop: (conn) => Promise.resolve(this.routeStop(conn)),
        update: (conn, config) => Promise.resolve(this.routeUpdate(conn, config))
      },
      this.runtimeEventHub
    )
    this.stateManager.setBackendClosedListener((lifecycle) =>
      this.connectionService.markClosed(lifecycle, 'system')
    )
    this.connectionService.onSessionClosed((lifecycle) =>
      this.stateManager.cleanupFinalized(lifecycle)
    )
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
      (lifecycle: SessionLifecycleRef) => {
        this.stateManager.notifyBackendClosed(lifecycle)
        // 同步清理 ftpClients（若存在）
        // FTP cleanup 由 ftpConnector 内部管理，此处通过 stateManager 统一通知即可
      }
    )

    // 设置日志分片回调
    _logger.setLogSplitCallback((connId, oldFileName, newFileName) => {
      this.windows.mainWindow?.webContents.send('on-log-split', {
        connId,
        oldFileName,
        newFileName
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
      return this.connectionService.start(conn, 'gui')
    })

    // start-connect-by-id（从存储中解密密码）
    ipcMain.handle(
      'start-connect-by-id',
      async (
        _,
        {
          id,
          sessionId,
          extraFields
        }: { id: number; sessionId: string | number; extraFields?: any }
      ) => {
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
        return this.connectionService.start(conn, 'gui')
      }
    )

    // send-data
    ipcMain.handle('send-data', async (_, { conn, command }: { conn: any; command: string }) => {
      const sessionId = String(conn.sessionId)
      return this.commandScheduler.run(sessionId, 'gui', () =>
        this.connectionService.send(sessionId, command, 'gui', conn)
      )
    })

    ipcMain.handle(
      'update-session-command-settings',
      (_, payload: { sessionId: string; settings: SessionCommandSettings; revision: number }) =>
        this.connectionService.updateCommandSettings(
          String(payload.sessionId),
          payload.settings,
          Number(payload.revision),
          'gui'
        )
    )

    // upload-file
    ipcMain.handle(
      'upload-file',
      async (
        _,
        {
          conn,
          localFilePath,
          remoteFileName
        }: { conn: any; localFilePath: string; remoteFileName: string }
      ) => {
        if (conn.connectionType !== 'ftp') {
          return { success: false, message: 'File upload only supported for FTP connections' }
        }
        return this.ftpConnector.uploadFile(conn, localFilePath, remoteFileName)
      }
    )

    // stop-connect
    ipcMain.handle('stop-connect', async (_, conn: any) => {
      return this.connectionService.stop(String(conn.sessionId), 'gui', conn)
    })

    // update-connect
    ipcMain.handle('update-connect', async (_, { conn, config }: { conn: any; config: any }) => {
      const connLabel = conn.comName || conn.host || conn.name || conn.sessionId
      logger.info(`update connect config: ${connLabel}, sessionId: ${conn.sessionId}`)

      if (config.receiveHex !== undefined) {
        const isHex = config.receiveHex === true || config.receiveHex === 'true'
        this.stateManager.setReceiveHex(conn.sessionId, isHex)
        return this.connectionService.update(
          String(conn.sessionId),
          { receiveHex: isHex },
          'gui',
          conn
        )
      }

      if (config.logTimestamp !== undefined) {
        const showTimestamp = config.logTimestamp === true || config.logTimestamp === 'true'
        this.stateManager.setLogTimestamp(conn.sessionId, showTimestamp)
        logger.info(`update logTimestamp: ${showTimestamp} for sessionId: ${conn.sessionId}`)
        if (this.workerConnector.shouldUseWorker(conn, this.useWorkerMode)) {
          const result = await this.workerConnector.updateConnectionConfig(conn, {
            logTimestamp: showTimestamp
          })
          this.connectionService.recordConfig(
            String(conn.sessionId),
            { logTimestamp: showTimestamp },
            'gui'
          )
          return result
        }
        this.connectionService.recordConfig(
          String(conn.sessionId),
          { logTimestamp: showTimestamp },
          'gui'
        )
        return { success: true, message: 'Updated successfully' }
      }

      return this.connectionService.update(String(conn.sessionId), config, 'gui', conn)
    })

    // 日志相关 IPC
    ipcMain.handle(
      'open-connect-log',
      async (_, sessionId: string, mode: 'folder' | 'file' = 'folder') => {
        logger.info(`open log (mode=${mode}): ${sessionId}`)
        if (sessionId) {
          return await _logger.openConnLog(sessionId, mode)
        }
        return await _logger.openLogDir()
      }
    )

    ipcMain.handle('get-log-file-path', async (_, sessionId: string) => {
      return await _logger.getLogFilePath(sessionId)
    })

    ipcMain.handle(
      'copy-log-file',
      async (_, { sessionId, destPath }: { sessionId: string; destPath: string }) => {
        return await _logger.copyLogFile(sessionId, destPath)
      }
    )

    ipcMain.handle('rotate-log-file', async (_, sessionId: string) => {
      return await _logger.rotateLogFile(sessionId)
    })

    ipcMain.handle(
      'write-to-log',
      async (_, { sessionId, content }: { sessionId: string; content: string }) => {
        _logger.appendToConnLog(content, sessionId)
        return { success: true }
      }
    )

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

  private routeStart(conn: any, lifecycle: SessionLifecycleRef): Promise<object> | object {
    this.initConnectionState(conn)
    if (this.workerConnector.shouldUseWorker(conn, this.useWorkerMode)) {
      return this.workerConnector.startConnection(conn, lifecycle)
    }
    if (conn.connectionType === 'ftp') {
      return this.ftpConnector.startConnection(
        conn,
        this.workerConnector.buildConnectInfo(conn),
        lifecycle
      )
    }
    return this.directConnector.startConnection(
      conn,
      this.workerConnector.buildConnectInfo(conn),
      lifecycle
    )
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
    // 手动断开时标记该连接下次重连会创建新的日志文件，同时保留旧日志记录，
    // 保证断开后仍可通过"打开日志所在文件夹/打开日志文件"访问日志。
    // 自动重连（连接失败自动重试）不经过 stop-connect，不会触发此处，因此日志文件会被复用，避免 0KB 空文件堆积
    if (conn?.sessionId != null) {
      this._logger?.markConnLogRotate(String(conn.sessionId))
    }
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
    const logTimestamp =
      conn.logTimestamp !== undefined
        ? conn.logTimestamp === true || conn.logTimestamp === 'true'
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

  applySettings(settings: {
    logSplitSize?: number
    enableLogStorage?: boolean
    logPath?: string
    logFileName?: string
  }): void {
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

  getConnectionService(): ConnectionService {
    return this.connectionService
  }

  getRuntimeEventHub(): RuntimeEventHub {
    return this.runtimeEventHub
  }

  getCommandScheduler(): CommandScheduler {
    return this.commandScheduler
  }

  /**
   * AI service lifecycle entry point. It intentionally reuses the same
   * stored-connection lookup, state initialization, logging, and
   * Public ConnectionService path as the GUI connection list.
   */
  async startConnectionByIdForAi(
    id: number,
    sessionId: string,
    extraFields: Record<string, unknown> = {}
  ): Promise<object> {
    const storedConn = this.connectionStorage.getByIdWithPassword(id)
    if (!storedConn) return { success: false, message: `Connection not found (id: ${id})` }
    const normalizedSessionId = String(sessionId)
    const conn = { ...extraFields, ...storedConn, sessionId: normalizedSessionId }

    return this.startConnectionForAi(conn, normalizedSessionId)
  }

  async startPortSessionForAi(
    portPath: string,
    sessionId: string,
    extraFields: Record<string, unknown> = {}
  ): Promise<object> {
    const normalizedSessionId = String(sessionId)
    const conn: Record<string, unknown> = {
      connectionType: 'com',
      comName: portPath,
      name: portPath,
      sessionId: normalizedSessionId,
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      encoding: 'utf8',
      readTimeout: 0,
      writeTimeout: 0,
      flowControl: 'none',
      rts: false,
      dtr: false,
      receiveHex: false,
      logTimestamp: true,
      ...extraFields
    }
    conn.connectionType = 'com'
    conn.comName = portPath
    conn.sessionId = normalizedSessionId

    return this.startConnectionForAi(conn, normalizedSessionId)
  }

  private async startConnectionForAi(conn: any, sessionId: string): Promise<object> {
    const normalizedSessionId = String(sessionId)
    const normalizedConn = { ...conn, sessionId: normalizedSessionId }

    // COM is an exclusive OS resource. If the GUI or another AI session already
    // owns this port, reuse the existing application session instead of opening
    // a second native handle and surfacing Windows "Access denied" to the user.
    if (
      normalizedConn.connectionType === 'com' &&
      typeof normalizedConn.comName === 'string' &&
      normalizedConn.comName
    ) {
      const existingSession = this.connectionService.findSessionByComName(normalizedConn.comName)
      if (existingSession) {
        return {
          success: true,
          reused: true,
          session: existingSession,
          message: `Reused the existing ${normalizedConn.comName} session`
        }
      }
    }

    this._logger?.createConnLogFile(
      normalizedSessionId,
      normalizedConn.name || normalizedConn.comName || normalizedSessionId,
      normalizedConn.remark || ''
    )
    return this.connectionService.start(normalizedConn, 'ai')
  }

  async stopConnectionForAi(sessionId: string): Promise<object> {
    return this.connectionService.stop(String(sessionId), 'ai')
  }

  async applyRuntimeConfigForAi(
    sessionId: string,
    config: Record<string, unknown>
  ): Promise<object> {
    const connection = this.connectionService.getConnection(String(sessionId))
    if (!connection) return { success: false, message: 'Session does not exist' }

    const remaining = { ...config }
    if (remaining.receiveHex !== undefined) {
      const isHex = remaining.receiveHex === true || remaining.receiveHex === 'true'
      if (this.workerConnector.shouldUseWorker(connection, this.useWorkerMode)) {
        const result = await this.workerConnector.updateConnectionConfig(connection, {
          receiveHex: isHex
        })
        if ((result as { success?: boolean }).success === false) return result
      }
      this.stateManager.setReceiveHex(String(sessionId), isHex)
      delete remaining.receiveHex
      this.connectionService.recordConfig(String(sessionId), { receiveHex: isHex }, 'ai')
    }

    if (remaining.logTimestamp !== undefined) {
      const showTimestamp = remaining.logTimestamp === true || remaining.logTimestamp === 'true'
      this.stateManager.setLogTimestamp(String(sessionId), showTimestamp)
      delete remaining.logTimestamp
      if (this.workerConnector.shouldUseWorker(connection, this.useWorkerMode)) {
        const result = await this.workerConnector.updateConnectionConfig(connection, {
          logTimestamp: showTimestamp
        })
        this.connectionService.recordConfig(
          String(sessionId),
          { logTimestamp: showTimestamp },
          'ai'
        )
        if ((result as { success?: boolean }).success === false) return result
      } else {
        this.connectionService.recordConfig(
          String(sessionId),
          { logTimestamp: showTimestamp },
          'ai'
        )
      }
    }

    if (Object.keys(remaining).length === 0) return { success: true }
    return this.connectionService.update(String(sessionId), remaining, 'ai')
  }

  /**
   * 应用退出时清理所有连接
   */
  async cleanup(): Promise<void> {
    await this.ftpConnector.cleanup()
    await this.workerConnector.shutdown()
  }
}
