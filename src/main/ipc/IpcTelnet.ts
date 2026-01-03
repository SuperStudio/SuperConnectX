import TelnetClient from '../protocol/TelnetClient'
import { ipcMain } from 'electron'
import logger from './IpcAppLogger'

export default class IpcTelnet {
  private static sInstance: IpcTelnet
  /* telnet 连接处理 */
  private telnetClient = new TelnetClient()

  constructor() {}

  static getInstance(): IpcTelnet {
    if (IpcTelnet.sInstance == null) {
      IpcTelnet.sInstance = new IpcTelnet()
    }

    return IpcTelnet.sInstance
  }

  init(_logger, windows): void {
    ipcMain.handle('connect-telnet', async (_, conn: any) => {
      logger.info(`start connect telnet: ${conn.name}`)
      _logger.createConnLogFile(conn.sessionId, conn.name)
      return await this.telnetClient.start(
        conn.host,
        conn.port,
        conn.sessionId,
        (dataStr) => {
          _logger.writeToConnLog(dataStr, conn.sessionId)
          windows.mainWindow?.webContents.send('telnet-data', {
            connId: conn.sessionId,
            data: dataStr
          })
        },
        () => {
          windows.mainWindow?.webContents.send('telnet-close', conn.sessionId)
          _logger.clearConnLogFile(conn.sessionId)
        }
      )
    })
    ipcMain.handle('telnet-send', async (_, { conn, command }: { conn: any; command: string }) =>
      this.telnetClient.send(conn.sessionId, command, (dataStr) =>
        _logger.writeToConnLog(dataStr, conn.sessionId)
      )
    )
    ipcMain.handle(
      'telnet-disconnect',
      async (_, connId: number) => await this.telnetClient.disconnect(connId)
    )
    // 新增：IPC 监听「打开日志」请求
    ipcMain.handle('open-telnet-log', async (_, sessionId: string) => {
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
