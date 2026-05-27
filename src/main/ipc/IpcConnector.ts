import TelnetClient from '../protocol/TelnetClient'
import { BrowserWindow } from 'electron'
import ConnectionInfo from '../protocol/ConnectionInfo'
import BaseClient from '../protocol/BaseClient'
import { ipcMain } from 'electron'
import logger from './IpcAppLogger'
import ComClient from '../protocol/ComClient'
import ProtocolLogger from '../utils/ProtocolLogger'
import SettingsStorage from '../storage/SettingsStorage'

export default class IpcConnector {
  private static sInstance: IpcConnector

  private CONNECT_TYPE_DATA = new Map<string, BaseClient>([
    ['telnet', new TelnetClient()],
    ['com', new ComClient()]
  ])

  // 用于动态存储每个会话的 receiveHex 状态
  private receiveHexMap = new Map<string, boolean>()

  // 用于动态存储每个会话的日志时间戳配置
  private logTimestampMap = new Map<string, boolean>()

  private settingsStorage: SettingsStorage
  private windows!: { mainWindow?: BrowserWindow | null }
  private _logger: ProtocolLogger | null = null

  constructor() {
    this.settingsStorage = new SettingsStorage()
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
      receiveHex: conn.receiveHex
    }

    return connInfo
  }

  init(_logger: ProtocolLogger, winRef: { mainWindow?: BrowserWindow | null }): void {
    this.windows = winRef
    this._logger = _logger

    // 设置日志分片回调
    _logger.setLogSplitCallback((connId, oldFileName, newFileName) => {
      // 通知前端日志文件已切换
      this.windows.mainWindow?.webContents.send('on-log-split', {
        connId,
        oldFileName,
        newFileName
      })
    })

    // 根据设置更新日志分片大小和日志存储开关
    const settings = this.settingsStorage.getSettings()
    if (settings.logSplitSize) {
      _logger.setLogSplitSize(settings.logSplitSize)
    }
    _logger.setEnableLogStorage(settings.enableLogStorage === true)

    ipcMain.handle('start-connect', async (_, conn: any) => {
      logger.info(`start connect telnet: ${conn.name}`)
      logger.debug(JSON.stringify(conn))
      _logger.createConnLogFile(conn.sessionId, conn.name)

      // 存储初始的 receiveHex 状态
      const receiveHex = conn.receiveHex === true || conn.receiveHex === 'true'
      this.receiveHexMap.set(conn.sessionId, receiveHex)

      // 存储初始的 logTimestamp 状态（默认为 true）
      const logTimestamp = conn.logTimestamp !== undefined
        ? (conn.logTimestamp === true || conn.logTimestamp === 'true')
        : true
      this.logTimestampMap.set(conn.sessionId, logTimestamp)

      const client = this.CONNECT_TYPE_DATA.get(conn.connectionType)
      const sessionId = conn.sessionId // 闭包中捕获 sessionId
      return await client?.start(
        this.buildConnectInfo(conn),
        (dataObj: { data: string; timestamp: string }) => {
          // 动态获取当前会话的 receiveHex 状态
          const isHex = this.receiveHexMap.get(sessionId) ?? false
          let displayData: string

          if (isHex) {
            // HEX 模式：将数据转为十六进制字符串
            displayData = ''
            for (let i = 0; i < dataObj.data.length; i++) {
              const hex = dataObj.data.charCodeAt(i).toString(16)
              displayData += hex.padStart(2, '0') + ' '
            }
            displayData = displayData.trim()
          } else {
            // STR 模式：直接返回解析后的字符串
            displayData = dataObj.data
          }

          this.windows.mainWindow?.webContents.send('on-recv-data', {
            connId: sessionId,
            data: displayData,
            timestamp: dataObj.timestamp,
            isHex: isHex
          })
        },
        () => {
          this.windows.mainWindow?.webContents.send('on-connect-close', sessionId)
          _logger.flushConnLog(sessionId)
          // 清理映射
          this.receiveHexMap.delete(sessionId)
          this.logTimestampMap.delete(sessionId)
        },
        (logStr, timestamp) => {
          // 根据 showTimestamp 决定是否添加时间戳
          const showTimestamp = this.logTimestampMap.get(sessionId) ?? true
          const finalLog = showTimestamp && timestamp ? `[${timestamp}] ${logStr}` : logStr
          // 使用 appendToConnLog（不添加额外时间戳，因为调用者已处理）
          _logger.appendToConnLog(finalLog, sessionId)
        }
      )
    })
    ipcMain.handle('send-data', async (_, { conn, command }: { conn: any; command: string }) =>
      this.CONNECT_TYPE_DATA.get(conn.connectionType)?.send(conn.sessionId, command, (dataStr) =>
        _logger.appendToConnLog(dataStr, conn.sessionId)
      )
    )
    ipcMain.handle(
      'stop-connect',
      async (_, conn: any) =>
        await this.CONNECT_TYPE_DATA.get(conn.connectionType)?.disconnect(conn.sessionId)
    )

    // 更新连接配置（主要用于串口参数热更新和动态切换 hex/str 模式）
    ipcMain.handle('update-connect', async (_, { conn, config }: { conn: any; config: any }) => {
      logger.info(`update connect config: ${conn.name}, sessionId: ${conn.sessionId}`)

      // 如果是动态切换 receiveHex，同时更新 ComClient 的 receiveHex 状态
      if (config.receiveHex !== undefined) {
        const isHex = config.receiveHex === true || config.receiveHex === 'true'
        this.receiveHexMap.set(conn.sessionId, isHex)
        // 通知 ComClient 更新 receiveHex 状态，以便 onLog 也使用正确的格式
        this.CONNECT_TYPE_DATA.get(conn.connectionType)?.setReceiveHex(conn.sessionId, isHex)
        logger.info(`update receiveHex: ${isHex} for sessionId: ${conn.sessionId}`)
        return { success: true, message: '更新成功' }
      }

      // 如果是动态切换 logTimestamp，更新日志时间戳配置
      if (config.logTimestamp !== undefined) {
        const showTimestamp = config.logTimestamp === true || config.logTimestamp === 'true'
        this.logTimestampMap.set(conn.sessionId, showTimestamp)
        logger.info(`update logTimestamp: ${showTimestamp} for sessionId: ${conn.sessionId}`)
        return { success: true, message: '更新成功' }
      }

      return await this.CONNECT_TYPE_DATA.get(conn.connectionType)?.updateConfig(conn.sessionId, config)
    })
    // 新增：IPC 监听「打开日志」请求
    ipcMain.handle('open-connect-log', async (_, sessionId: string) => {
      logger.info(`open telnet log: ${sessionId}`)
      if (sessionId) {
        return await _logger.openConnLog(sessionId)
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

    logger.info(`init IpcTelnet done`)
  }

  // 运行时应用设置变更（无需重启）
  applySettings(settings: { logSplitSize?: number; enableLogStorage?: boolean }): void {
    if (settings.logSplitSize && this._logger) {
      this._logger.setLogSplitSize(settings.logSplitSize)
    }
    if (settings.enableLogStorage !== undefined && this._logger) {
      this._logger.setEnableLogStorage(settings.enableLogStorage)
    }
  }
}
