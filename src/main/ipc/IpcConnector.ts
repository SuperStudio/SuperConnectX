import TelnetClient from '../protocol/TelnetClient'
import ConnectionInfo from '../protocol/ConnectionInfo'
import BaseClient from '../protocol/BaseClient'
import { ipcMain } from 'electron'
import logger from './IpcAppLogger'
import FtpClient from '../protocol/FtpClient'
import ComClient from '../protocol/ComClient'

export default class IpcConnector {
  private static sInstance: IpcConnector

  private CONNECT_TYPE_DATA = new Map<string, BaseClient>([
    ['telnet', new TelnetClient()],
    ['ftp', new FtpClient()],
    ['com', new ComClient()]
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
      sessionId: conn.sessionId,
      // 串口参数
      comName: conn.comName,
      baudRate: conn.baudRate,
      dataBits: conn.dataBits,
      stopBits: conn.stopBits,
      parity: conn.parity
    }

    return connInfo
  }

  init(_logger, windows): void {
    ipcMain.handle('start-connect', async (_, conn: any) => {
      logger.info(`start connect telnet: ${conn.name}`)
      logger.debug(JSON.stringify(conn))
      _logger.createConnLogFile(conn.sessionId, conn.name)
      const client = this.CONNECT_TYPE_DATA.get(conn.connectionType)
      logger.info(`IpcConnector: client type = ${conn.connectionType}, client = ${client?.constructor.name}`)
      try {
        const result = await client?.start(
          this.buildConnectInfo(conn),
          (dataStr) => {
            logger.debug(`IpcConnector onData: ${dataStr.substring(0, 50)}...`)
            _logger.writeToConnLog(dataStr, conn.sessionId)
            if (windows.mainWindow) {
              windows.mainWindow.webContents.send('on-recv-data', {
                connId: conn.sessionId,
                data: dataStr
              })
            } else {
              logger.warn('IpcConnector: windows.mainWindow is null, cannot send data')
            }
          },
          () => {
            windows.mainWindow?.webContents.send('on-connect-close', conn.sessionId)
            _logger.flushConnLog(conn.sessionId)
          }
        )
        logger.info(`IpcConnector startConnect result: ${JSON.stringify(result)}`)
        return result
      } catch (err) {
        logger.error(`IpcConnector startConnect error: ${err}`)
        return { success: false, message: String(err) }
      }
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
