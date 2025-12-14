import ConnectionStorage from '../storage/ConnectionStorage'
import PreSetCommandStorage from '../storage/PreSetCommandStorage'
import { ipcMain } from 'electron'
import logger from './IpcAppLogger'
import CommandGroupStorage from '../storage/CommandGroupStorage'

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

    /* 组持久化 */
    const groupStorage = new CommandGroupStorage()
    ipcMain.handle('get-command-groups', () => groupStorage.getAll())
    ipcMain.handle('add-command-group', (_, group) => groupStorage.add(group))
    ipcMain.handle('update-command-group', (_, group) => groupStorage.update(group))
    ipcMain.handle('delete-command-group', (_, id) => {
      preSetCommandStorage.deleteByGroupId(id)
      return groupStorage.delete(id)
    })

    logger.info(`init IpcStorage done`)
  }
}
