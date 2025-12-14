import ConnectionStorage from '../storage/ConnectionStorage'
import PreSetCommandStorage from '../storage/PreSetCommandStorage'
import { ipcMain } from 'electron'

export default class IpcStorage {
  private static sInstance: IpcStorage

  constructor() {}

  static getInstance(): IpcStorage {
    if (IpcStorage.sInstance == null) {
      IpcStorage.sInstance = new IpcStorage()
    }

    return IpcStorage.sInstance
  }

  init(): void {
    /* 连接持久化处理 */
    const connectionStorage = new ConnectionStorage()
    ipcMain.handle('get-connections', () => connectionStorage.getConnections())
    ipcMain.handle('add-connection', (_, conn: any) => connectionStorage.addConnection(conn))
    ipcMain.handle('update-connection', (_, conn: any) => connectionStorage.updateConnection(conn))
    ipcMain.handle('delete-connection', (_, id: number) => connectionStorage.deleteConnection(id))

    /* 发送命令持久化 */
    const preSetCommandStorage = new PreSetCommandStorage()
    ipcMain.handle('get-preset-commands', () => preSetCommandStorage.getAll())
    ipcMain.handle('add-preset-command', (_, cmd: any) => preSetCommandStorage.add(cmd))
    ipcMain.handle('update-preset-command', (_, cmd: any) => preSetCommandStorage.update(cmd))
    ipcMain.handle('delete-preset-command', (_, id: number) => preSetCommandStorage.delete(id))
  }
}
