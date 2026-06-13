import { BrowserWindow, app } from 'electron'
import ConnectionInfo from '../protocol/ConnectionInfo'
import { ipcMain } from 'electron'
import logger from './IpcAppLogger'
import ProtocolLogger from '../utils/ProtocolLogger'
import SettingsStorage from '../storage/SettingsStorage'
import WorkerPool from '../pool/WorkerPool'
import path from 'path'

// 直连模式客户端接口（Telnet/COM 客户端均实现）
interface DirectClient {
  start(info: ConnectionInfo, onData: (dataObj: { data: string; timestamp: string }) => void, onClose: () => void, onLog: (logStr: string, timestamp: string) => void): Promise<object>
  send(sessionId: string, command: string, onComplete: (dataStr: string) => void): Promise<object>
  disconnect(sessionId: string): Promise<object>
  updateConfig(sessionId: string, config: Record<string, unknown>): Promise<object>
}

export default class IpcConnector {
  private static sInstance: IpcConnector

  // Worker 池
  private workerPool: WorkerPool

  // 用于动态存储每个会话的 receiveHex 状态
  private receiveHexMap = new Map<string, boolean>()

  // 用于动态存储每个会话的日志时间戳配置
  private logTimestampMap = new Map<string, boolean>()

  // 连接类型记录（sessionId -> connectionType）
  private connectionTypeMap = new Map<string, string>()

  // FTP 模式记录（sessionId -> ftpMode: 'server' | 'client'）
  private ftpModeMap = new Map<string, string>()

  private settingsStorage: SettingsStorage
  private windows!: { mainWindow?: BrowserWindow | null }
  private _logger: ProtocolLogger | null = null

  // 是否启用 Worker 模式（可通过设置切换，默认启用）
  private useWorkerMode: boolean = true

  constructor() {
    this.settingsStorage = new SettingsStorage()
    this.workerPool = WorkerPool.getInstance()
  }

  static getInstance(): IpcConnector {
    if (IpcConnector.sInstance == null) {
      IpcConnector.sInstance = new IpcConnector()
    }

    return IpcConnector.sInstance
  }

  buildConnectInfo(conn): ConnectionInfo {
    const connInfo: ConnectionInfo = {
      host: conn.host,
      port: conn.port,
      username: conn.username,
      password: conn.password,
      sessionId: conn.sessionId,
      // 串口参数
      comName: conn.comName,
      baudRate: conn.baudRate,
      dataBits: conn.dataBits,
      stopBits: conn.stopBits,
      parity: conn.parity,
      encoding: conn.encoding,
      readTimeout: conn.readTimeout,
      writeTimeout: conn.writeTimeout,
      flowControl: conn.flowControl,
      rts: conn.rts,
      dtr: conn.dtr,
      receiveHex: conn.receiveHex,
      // FTP 参数
      ftpMode: conn.ftpMode,
      ftpDirectory: conn.ftpDirectory,
      ftpPermissions: conn.ftpPermissions
    }

    return connInfo
  }

  init(_logger: ProtocolLogger, winRef: { mainWindow?: BrowserWindow | null }): void {
    this.windows = winRef
    this._logger = _logger

    // 设置 Worker 池回调（Worker 模式下的数据/日志/关闭路由）
    this.workerPool.setCallbacks(
      // onData: Worker 回传的数据
      (sessionId: string, displayData: string, timestamp: string, isHex: boolean) => {
        this.windows.mainWindow?.webContents.send('on-recv-data', {
          connId: sessionId,
          data: displayData,
          timestamp,
          isHex
        })
      },
      // onLog: Worker 回传的日志
      (sessionId: string, logStr: string, timestamp: string) => {
        if (!this._logger) return
        const showTimestamp = this.logTimestampMap.get(sessionId) ?? true
        const finalLog = showTimestamp && timestamp ? `[${timestamp}] ${logStr}` : logStr
        this._logger.appendToConnLog(finalLog, sessionId)
      },
      // onClose: Worker 通知连接断开
      (sessionId: string) => {
        this.windows.mainWindow?.webContents.send('on-connect-close', sessionId)
        this._logger?.flushConnLog(sessionId)
        this.receiveHexMap.delete(sessionId)
        this.logTimestampMap.delete(sessionId)
        this.connectionTypeMap.delete(sessionId)
        this.ftpModeMap.delete(sessionId)
        // 同步清理 _ftpClients（若存在）
        const ftpClient = this._ftpClients.get(sessionId)
        if (ftpClient) {
          try { ftpClient.disconnect(sessionId) } catch { /* ignore */ }
          this._ftpClients.delete(sessionId)
        }
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

    // 根据设置更新日志分片大小、日志存储开关、日志路径和文件名模板
    const settings = this.settingsStorage.getSettings()
    if (settings.logSplitSize) {
      _logger.setLogSplitSize(settings.logSplitSize)
    }
    _logger.setEnableLogStorage(settings.enableLogStorage === true)

    // 首次使用时 logPath 为空，自动设置为 exe 目录下的 logs 目录
    if (!settings.logPath) {
      const exePath = app.getPath('exe')
      const appDir = path.dirname(exePath)
      const defaultLogPath = path.join(appDir, 'logs')
      settings.logPath = defaultLogPath
      this.settingsStorage.saveSettings({ logPath: defaultLogPath })
    }
    _logger.setLogDir(settings.logPath)

    if (settings.logFileName) {
      _logger.setLogFileName(settings.logFileName)
    }

    // ============ 注册 IPC Handler ============

    /**
     * 判断连接是否应该使用 Worker 模式
     * - Telnet：纯 JS 协议，可以在 Worker 中运行，实现线程隔离
     * - COM：serialport 原生模块不支持 worker_threads（ACCESS_VIOLATION），必须主线程处理
     */
    const shouldUseWorker = (conn: any): boolean => {
      if (!this.useWorkerMode) return false
      // COM 连接不走 Worker（serialport native addon 与 worker_threads 不兼容）
      if (conn.connectionType === 'com') return false
      // FTP 不走 Worker（服务端 ftp-srv 有不可序列化对象；客户端 net.Socket 不兼容 worker_threads）
      if (conn.connectionType === 'ftp') return false
      return true
    }

    ipcMain.handle('start-connect', async (_, conn: any) => {
      logger.info(`start connect: ${conn.name} (type: ${conn.connectionType})`)
      logger.debug(JSON.stringify(conn))
      _logger.createConnLogFile(conn.sessionId, conn.name, conn.remark || '')

      // 存储初始的 receiveHex 状态
      const receiveHex = conn.receiveHex === true || conn.receiveHex === 'true'
      this.receiveHexMap.set(conn.sessionId, receiveHex)

      // 存储初始的 logTimestamp 状态（默认为 true）
      const logTimestamp = conn.logTimestamp !== undefined
        ? (conn.logTimestamp === true || conn.logTimestamp === 'true')
        : true
      this.logTimestampMap.set(conn.sessionId, logTimestamp)

      // 记录连接类型和 FTP 模式
      this.connectionTypeMap.set(conn.sessionId, conn.connectionType)
      if (conn.connectionType === 'ftp' && conn.ftpMode) {
        this.ftpModeMap.set(conn.sessionId, conn.ftpMode)
      }

      if (shouldUseWorker(conn)) {
        // Worker 模式（Telnet 等纯 JS 协议）
        const connInfo = this.buildConnectInfo(conn)
        return await this.workerPool.startConnection(connInfo, conn.connectionType)
      } else {
        // 直连模式（COM 等依赖 native addon 的协议）
        return this.startConnectDirect(conn)
      }
    })

    ipcMain.handle('send-data', async (_, { conn, command }: { conn: any; command: string }) => {
      if (shouldUseWorker(conn)) {
        return await this.workerPool.sendData(conn.sessionId, conn.connectionType, command)
      } else {
        return this.sendDataDirect(conn, command)
      }
    })

    ipcMain.handle('upload-file', async (_, { conn, localFilePath, remoteFileName }: { conn: any; localFilePath: string; remoteFileName: string }) => {
      if (conn.connectionType !== 'ftp') {
        return { success: false, message: 'File upload only supported for FTP connections' }
      }
      return this.uploadFileDirect(conn, localFilePath, remoteFileName)
    })

    ipcMain.handle('stop-connect', async (_, conn: any) => {
      if (shouldUseWorker(conn)) {
        return await this.workerPool.stopConnection(conn.sessionId, conn.connectionType)
      } else {
        return this.stopConnectDirect(conn)
      }
    })

    // 更新连接配置（主要用于串口参数热更新和动态切换 hex/str 模式）
    ipcMain.handle('update-connect', async (_, { conn, config }: { conn: any; config: any }) => {
      logger.info(`update connect config: ${conn.name}, sessionId: ${conn.sessionId}`)

      // 如果是动态切换 receiveHex
      if (config.receiveHex !== undefined) {
        const isHex = config.receiveHex === true || config.receiveHex === 'true'
        this.receiveHexMap.set(conn.sessionId, isHex)

        if (shouldUseWorker(conn)) {
          return await this.workerPool.updateConnectionConfig(conn.sessionId, conn.connectionType, { receiveHex: isHex })
        } else {
          return this.updateConnectDirect(conn, { receiveHex: isHex })
        }
      }

      // 如果是动态切换 logTimestamp
      if (config.logTimestamp !== undefined) {
        const showTimestamp = config.logTimestamp === true || config.logTimestamp === 'true'
        this.logTimestampMap.set(conn.sessionId, showTimestamp)
        logger.info(`update logTimestamp: ${showTimestamp} for sessionId: ${conn.sessionId}`)

        if (shouldUseWorker(conn)) {
          return await this.workerPool.updateConnectionConfig(conn.sessionId, conn.connectionType, { logTimestamp: showTimestamp })
        }
        return { success: true, message: 'Updated successfully' }
      }

      if (shouldUseWorker(conn)) {
        return await this.workerPool.updateConnectionConfig(conn.sessionId, conn.connectionType, config)
      } else {
        return this.updateConnectDirect(conn, config)
      }
    })

    // 打开日志
    ipcMain.handle('open-connect-log', async (_, sessionId: string, mode: 'folder' | 'file' = 'folder') => {
      logger.info(`open log (mode=${mode}): ${sessionId}`)
      if (sessionId) {
        return await _logger.openConnLog(sessionId, mode)
      } else {
        return await _logger.openLogDir()
      }
    })

    // 获取日志文件路径
    ipcMain.handle('get-log-file-path', async (_, sessionId: string) => {
      return await _logger.getLogFilePath(sessionId)
    })

    // 复制日志文件
    ipcMain.handle('copy-log-file', async (_, { sessionId, destPath }: { sessionId: string; destPath: string }) => {
      return await _logger.copyLogFile(sessionId, destPath)
    })

    // 直接写入日志（前端调用，已包含时间戳）
    ipcMain.handle('write-to-log', async (_, { sessionId, content }: { sessionId: string; content: string }) => {
      _logger.appendToConnLog(content, sessionId)
      return { success: true }
    })

    // 获取 Worker 池状态（调试用）
    ipcMain.handle('get-worker-pool-status', async () => {
      return this.workerPool.getStatus()
    })

    // 设置是否启用 Worker 模式
    ipcMain.handle('set-worker-mode', async (_, enabled: boolean) => {
      this.useWorkerMode = enabled
      logger.info(`Worker mode ${enabled ? 'enabled' : 'disabled'}`)
      return { success: true }
    })

    logger.info(`init IpcConnector done (Worker mode: ${this.useWorkerMode})`)
  }

  // ============ 直连模式（回退方案，保留原有逻辑）============

  // FTP 服务端实例（直连模式，不走 Worker）
  private _ftpServer: DirectClient | null = null
  private _ftpServerStopping: Promise<void> | null = null
  // FTP 客户端实例（每个 session 一个，直连模式）
  private _ftpClients: Map<string, DirectClient> = new Map()

  /**
   * 判断当前 FTP 连接是否为服务端模式
   * 仅当 ftpModeMap 中明确记录为 'server' 时才走服务端模式
   */
  private isFtpServerMode(sessionId: string): boolean {
    return this.ftpModeMap.get(sessionId) === 'server'
  }

  private async startConnectDirect(conn: any): Promise<object> {
    const sessionId = conn.sessionId
    const _logger = this._logger!

    // FTP 连接：区分服务端/客户端
    if (conn.connectionType === 'ftp') {
      if (this.isFtpServerMode(sessionId)) {
        // FTP 服务端模式
        // 等待上一个 stop 完成（避免端口占用等竞争问题）
        if (this._ftpServerStopping) {
          await this._ftpServerStopping
          this._ftpServerStopping = null
        }
        const FtpServer = (await import('../protocol/FtpServer')).default
        if (!this._ftpServer) {
          this._ftpServer = new FtpServer()
        }
        return await this._ftpServer.start(
          this.buildConnectInfo(conn),
          (dataObj: { data: string; timestamp: string }) => {
            const wc = this.windows.mainWindow?.webContents
            if (wc && !wc.isDestroyed()) {
              wc.send('on-recv-data', {
                connId: sessionId,
                data: dataObj.data,
                timestamp: dataObj.timestamp,
                isHex: false
              })
            }
          },
          () => {
            _logger.flushConnLog(sessionId)
            this.receiveHexMap.delete(sessionId)
            this.logTimestampMap.delete(sessionId)
            this.connectionTypeMap.delete(sessionId)
            this.ftpModeMap.delete(sessionId)
            const wc = this.windows.mainWindow?.webContents
            if (wc && !wc.isDestroyed()) {
              wc.send('on-connect-close', sessionId)
            }
          },
          (logStr: string, timestamp: string) => {
            const showTimestamp = this.logTimestampMap.get(sessionId) ?? true
            const finalLog = showTimestamp && timestamp ? `[${timestamp}] ${logStr}` : logStr
            _logger.appendToConnLog(finalLog, sessionId)
          }
        )
      } else {
        // FTP 客户端模式
        const FtpClient = (await import('../protocol/FtpClient')).default
        const client = new FtpClient()
        this._ftpClients.set(sessionId, client)
        return await client.start(
          this.buildConnectInfo(conn),
          (dataObj: { data: string; timestamp: string }) => {
            const wc = this.windows.mainWindow?.webContents
            if (wc && !wc.isDestroyed()) {
              wc.send('on-recv-data', {
                connId: sessionId,
                data: dataObj.data,
                timestamp: dataObj.timestamp,
                isHex: false
              })
            }
          },
          () => {
            _logger.flushConnLog(sessionId)
            this.receiveHexMap.delete(sessionId)
            this.logTimestampMap.delete(sessionId)
            this.connectionTypeMap.delete(sessionId)
            this.ftpModeMap.delete(sessionId)
            this._ftpClients.delete(sessionId)
            const wc = this.windows.mainWindow?.webContents
            if (wc && !wc.isDestroyed()) {
              wc.send('on-connect-close', sessionId)
            }
          },
          (logStr: string, timestamp: string) => {
            const showTimestamp = this.logTimestampMap.get(sessionId) ?? true
            const finalLog = showTimestamp && timestamp ? `[${timestamp}] ${logStr}` : logStr
            _logger.appendToConnLog(finalLog, sessionId)
          }
        )
      }
    }

    // 动态 import 直连模式的客户端，每个 session 独立实例（避免回调覆盖）
    const ComClient = (await import('../protocol/ComClient')).default
    const TelnetClient = (await import('../protocol/TelnetClient')).default

    const ClientClass = conn.connectionType === 'com' ? ComClient : TelnetClient
    const client = new ClientClass()
    this._directClients.set(sessionId, client)

    return await client.start(
      this.buildConnectInfo(conn),
      (dataObj: { data: string; timestamp: string }) => {
        const wc = this.windows.mainWindow?.webContents
        if (!wc || wc.isDestroyed()) return
        const isHex = this.receiveHexMap.get(sessionId) ?? false
        let displayData: string
        if (isHex) {
          displayData = ''
          for (let i = 0; i < dataObj.data.length; i++) {
            const hex = dataObj.data.charCodeAt(i).toString(16)
            displayData += hex.padStart(2, '0') + ' '
          }
          displayData = displayData.trim()
        } else {
          displayData = dataObj.data
        }
        wc.send('on-recv-data', {
          connId: sessionId,
          data: displayData,
          timestamp: dataObj.timestamp,
          isHex
        })
      },
      () => {
        _logger.flushConnLog(sessionId)
        this.receiveHexMap.delete(sessionId)
        this.logTimestampMap.delete(sessionId)
        this.connectionTypeMap.delete(sessionId)
        this._directClients.delete(sessionId)
        const wc = this.windows.mainWindow?.webContents
        if (wc && !wc.isDestroyed()) {
          wc.send('on-connect-close', sessionId)
        }
      },
      (logStr: string, timestamp: string) => {
        const showTimestamp = this.logTimestampMap.get(sessionId) ?? true
        const finalLog = showTimestamp && timestamp ? `[${timestamp}] ${logStr}` : logStr
        _logger.appendToConnLog(finalLog, sessionId)
      }
    )
  }

  // 直连模式客户端实例（每个 session 独立实例，避免 onData/onClose 回调覆盖）
  private _directClients: Map<string, DirectClient> = new Map()

  private async sendDataDirect(conn: any, command: string): Promise<object> {
    // FTP 客户端模式
    if (conn.connectionType === 'ftp') {
      if (this.isFtpServerMode(conn.sessionId)) {
        if (this._ftpServer) {
          return await this._ftpServer.send(conn.sessionId, command)
        }
        return { success: false, message: 'FTP server not running' }
      } else {
        const client = this._ftpClients.get(conn.sessionId)
        if (client) {
          return await client.send(conn.sessionId, command,
            (dataStr: string) => this._logger?.appendToConnLog(dataStr, conn.sessionId))
        }
        return { success: false, message: 'FTP client not connected' }
      }
    }
    const client = this._directClients.get(conn.sessionId)
    if (!client) return { success: false, message: 'Direct mode client not initialized' }
    return await client.send(
      conn.sessionId, command,
      (dataStr: string) => this._logger?.appendToConnLog(dataStr, conn.sessionId)
    )
  }

  private async stopConnectDirect(conn: any): Promise<object> {
    // FTP 连接：区分服务端/客户端
    if (conn.connectionType === 'ftp') {
      if (this.isFtpServerMode(conn.sessionId)) {
        if (this._ftpServer) {
          const stopPromise = (async () => {
            try {
              await this._ftpServer!.stop()
            } finally {
              this._ftpServer = null
            }
          })()
          this._ftpServerStopping = stopPromise
          try {
            await stopPromise
          } finally {
            this._ftpServerStopping = null
          }
          return { success: true, message: 'FTP server stopped' }
        }
        return { success: true }
      } else {
        const client = this._ftpClients.get(conn.sessionId)
        if (client) {
          const result = await client.disconnect(conn.sessionId)
          this._ftpClients.delete(conn.sessionId)
          return result
        }
        return { success: true }
      }
    }
    const client = this._directClients.get(conn.sessionId)
    if (!client) return { success: true }
    const result = await client.disconnect(conn.sessionId)
    this._directClients.delete(conn.sessionId)
    return result || { success: true }
  }

  private async updateConnectDirect(conn: any, config: any): Promise<object> {
    if (conn.connectionType === 'ftp') {
      if (this.isFtpServerMode(conn.sessionId)) {
        return { success: true, message: 'Config updated' }
      } else {
        const client = this._ftpClients.get(conn.sessionId)
        return client?.updateConfig(conn.sessionId, config)
          || { success: true, message: 'Config updated' }
      }
    }
    const client = this._directClients.get(conn.sessionId)
    if (!client) return { success: false, message: 'Direct mode client not initialized' }
    return await client.updateConfig(conn.sessionId, config)
  }

  private async uploadFileDirect(conn: any, localFilePath: string, remoteFileName: string): Promise<object> {
    const sessionId = conn.sessionId
    const client = this._ftpClients.get(sessionId)
    if (!client) {
      return { success: false, message: 'FTP client not connected' }
    }
    if (typeof client.uploadFile !== 'function') {
      return { success: false, message: 'FTP client does not support file upload' }
    }
    const _logger = this._logger!
    return await client.uploadFile(
      sessionId,
      localFilePath,
      remoteFileName,
      (dataObj: { data: string; timestamp: string }) => {
        const wc = this.windows.mainWindow?.webContents
        if (wc && !wc.isDestroyed()) {
          wc.send('on-recv-data', {
            connId: sessionId,
            data: dataObj.data,
            timestamp: dataObj.timestamp,
            isHex: false
          })
        }
      },
      (logStr: string, timestamp: string) => {
        const showTimestamp = this.logTimestampMap.get(sessionId) ?? true
        const finalLog = showTimestamp && timestamp ? `[${timestamp}] ${logStr}` : logStr
        _logger.appendToConnLog(finalLog, sessionId)
      }
    )
  }

  // ============ 运行时设置变更 ============

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
   * 应用退出时清理 Worker 池
   */
  async cleanup(): Promise<void> {
    if (this._ftpServer) {
      try { await this._ftpServer.stop() } catch { /* ignore */ }
      this._ftpServer = null
    }
    for (const [sessionId, client] of this._ftpClients) {
      try { await client.disconnect(sessionId) } catch { /* ignore */ }
    }
    this._ftpClients.clear()
    await this.workerPool.shutdown()
  }
}
