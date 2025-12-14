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
      _logger.createConnLogFile(conn.id, conn.name)
      return await this.telnetClient.start(
        conn.host,
        conn.port,
        conn.id,
        (dataStr) => {
          _logger.writeToConnLog(dataStr, conn.id)
          windows.mainWindow?.webContents.send('telnet-data', {
            connId: conn.id,
            data: dataStr
          })
        },
        () => {
          windows.mainWindow?.webContents.send('telnet-close', conn.id)
          _logger.clearConnLogFile(conn.id)
        }
      )
    })
    ipcMain.handle('telnet-send', async (_, { conn, command }: { conn: any; command: string }) =>
      this.telnetClient.send(conn.id, command, (dataStr) =>
        _logger.writeToConnLog(dataStr, conn.id)
      )
    )
    ipcMain.handle(
      'telnet-disconnect',
      async (_, connId: number) => await this.telnetClient.disconnect(connId)
    )
    // 新增：IPC 监听「打开日志」请求
    ipcMain.handle('open-telnet-log', async (_, conn: any) => {
      if (conn.id) {
        return await _logger.openConnLog(conn.id)
      } else {
        return await _logger.openLogDir()
      }
    })

    logger.info(`init IpcTelnet done`)
  }
}
