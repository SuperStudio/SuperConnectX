import ConnectionStorage from '../storage/ConnectionStorage'
import PreSetCommandStorage from '../storage/PreSetCommandStorage'
import { ipcMain } from 'electron'
import logger from './IpcAppLogger'
import CommandGroupStorage from '../storage/CommandGroupStorage'
import ComSettingsStorage from '../storage/ComSettingsStorage'
import AppSettingsStorage from '../storage/AppSettingsStorage'

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
    ipcMain.handle('get-connections', () => connectionStorage.getAll())
    ipcMain.handle('add-connection', (_, conn: any) => connectionStorage.add(conn))
    ipcMain.handle('update-connection', (_, conn: any) => connectionStorage.update(conn))
    ipcMain.handle('delete-connection', (_, id: number) => connectionStorage.delete(id))

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

    /* 命令导入导出 */
    ipcMain.handle('export-commands', (_, filePath: string) =>
      preSetCommandStorage.exportCommands(groupStorage, filePath)
    )

    ipcMain.handle('import-commands', (_, filePath: string) =>
      preSetCommandStorage.importCommands(groupStorage, filePath)
    )

    /* COM 串口设置持久化 */
    const comSettingsStorage = new ComSettingsStorage()
    ipcMain.handle('get-com-settings', (_, comName: string) => comSettingsStorage.getSettings(comName))
    ipcMain.handle('save-com-settings', (_, comName: string, settings: any) => {
      comSettingsStorage.saveSettings(comName, settings)
      return true
    })

    /* 全局波特率列表持久化 */
    ipcMain.handle('get-baud-rates', () => {
      const rates = comSettingsStorage.getBaudRates()
      console.log('[IpcStorage] get-baud-rates:', rates)
      return rates
    })
    ipcMain.handle('save-baud-rates', (_, baudRates: number[]) => {
      console.log('[IpcStorage] save-baud-rates called with:', baudRates)
      comSettingsStorage.saveBaudRates(baudRates)
      return true
    })

    /* 应用全局设置持久化 */
    const appSettingsStorage = new AppSettingsStorage()
    ipcMain.handle('get-app-settings', () => appSettingsStorage.getSettings())
    ipcMain.handle('save-app-settings', (_, settings: any) => {
      appSettingsStorage.saveSettings(settings)
      return true
    })

    logger.info(`init IpcStorage done`)
  }
}
