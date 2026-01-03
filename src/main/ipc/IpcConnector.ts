import TelnetClient from '../protocol/TelnetClient'
import BaseClient from '../protocol/BaseClient'
import { ipcMain } from 'electron'
import logger from './IpcAppLogger'

export default class IpcConnector {
  private static sInstance: IpcConnector
  /* telnet 连接处理 */
  private telnetClient = new TelnetClient()

  private CONNECT_TYPE_DATA = new Map<string, BaseClient>([
    ['telnet', new TelnetClient()],
    ['ftp', new TelnetClient()]
  ])

  constructor() {}

  static getInstance(): IpcConnector {
    if (IpcConnector.sInstance == null) {
      IpcConnector.sInstance = new IpcConnector()
    }

    return IpcConnector.sInstance
  }

  init(_logger, windows): void {
    ipcMain.handle('start-connect', async (_, conn: any) => {
      logger.info(`start connect telnet: ${conn.name}`)
      logger.debug(JSON.stringify(conn))
      _logger.createConnLogFile(conn.sessionId, conn.name)
      return await this.CONNECT_TYPE_DATA.get(conn.connectionType)?.start(
        conn.host,
        conn.port,
        conn.sessionId,
        (dataStr) => {
          _logger.writeToConnLog(dataStr, conn.sessionId)
          windows.mainWindow?.webContents.send('on-recv-data', {
            connId: conn.sessionId,
            data: dataStr
          })
        },
        () => {
          windows.mainWindow?.webContents.send('on-connect-close', conn.sessionId)
          _logger.clearConnLogFile(conn.sessionId)
        }
      )
    })
    ipcMain.handle('send-data', async (_, { conn, command }: { conn: any; command: string }) =>
      this.CONNECT_TYPE_DATA.get(conn.connectionType)?.send(conn.sessionId, command, (dataStr) =>
        _logger.writeToConnLog(dataStr, conn.sessionId)
      )
    )
    ipcMain.handle(
      'stop-connect',
      async (_, conn: any) =>
        await this.CONNECT_TYPE_DATA.get(conn.connectionType)?.disconnect(conn.sessionId)
    )
    // 新增：IPC 监听「打开日志」请求
    ipcMain.handle('open-connect-log', async (_, sessionId: string) => {
      logger.info(`open telnet log: ${sessionId}`)
      if (sessionId) {
        return await _logger.openConnLog(sessionId)
      } else {
        return await _logger.openLogDir()
      }
    })

    logger.info(`init IpcTelnet done`)
  }
}
