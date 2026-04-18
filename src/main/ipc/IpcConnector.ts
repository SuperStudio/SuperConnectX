import TelnetClient from '../protocol/TelnetClient'
import ConnectionInfo from '../protocol/ConnectionInfo'
import BaseClient from '../protocol/BaseClient'
import { ipcMain } from 'electron'
import logger from './IpcAppLogger'
import FtpClient from '../protocol/FtpClient'

export default class IpcConnector {
  private static sInstance: IpcConnector

  private CONNECT_TYPE_DATA = new Map<string, BaseClient>([
    ['telnet', new TelnetClient()],
    ['ftp', new FtpClient()]
  ])

  constructor() {}

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
      sessionId: conn.sessionId
    }

    return connInfo
  }

  init(_logger, windows): void {
    ipcMain.handle('start-connect', async (_, conn: any) => {
      logger.info(`start connect telnet: ${conn.name}`)
      logger.debug(JSON.stringify(conn))
      _logger.createConnLogFile(conn.sessionId, conn.name)
      const client = this.CONNECT_TYPE_DATA.get(conn.connectionType)
      return await client?.start(
        this.buildConnectInfo(conn),
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
