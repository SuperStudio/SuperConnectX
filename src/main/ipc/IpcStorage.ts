import ConnectionStorage from '../storage/ConnectionStorage'
import PreSetCommandStorage from '../storage/PreSetCommandStorage'
import ShortcutsStorage, { SHORTCUT_ACTIONS } from '../storage/ShortcutsStorage'
import { ipcMain } from 'electron'
import logger from './IpcAppLogger'
import CommandGroupStorage from '../storage/CommandGroupStorage'
import ComSettingsStorage from '../storage/ComSettingsStorage'
import AppSettingsStorage from '../storage/AppSettingsStorage'
import SettingsStorage from '../storage/SettingsStorage'
import CommandHistoryStorage from '../storage/CommandHistoryStorage'
import IpcConnector from './IpcConnector'

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
    ipcMain.handle('get-com-settings', (_, comName: string) => {
      return comSettingsStorage.getSettings(comName)
    })
    ipcMain.handle('save-com-settings', (_, comName: string, settings: any) => {
      comSettingsStorage.saveSettings(comName, settings)
      return true
    })

    /* 全局波特率列表持久化 */
    ipcMain.handle('get-baud-rates', () => {
      return comSettingsStorage.getBaudRates()
    })
    ipcMain.handle('save-baud-rates', (_, baudRates: number[]) => {
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

    /* 设置页面持久化 */
    const settingsStorage = new SettingsStorage()

    /* 命令历史持久化（需要在 settings 之后初始化，因为依赖 settingsStorage） */
    const commandHistoryStorage = new CommandHistoryStorage(settingsStorage)

    ipcMain.handle('get-settings', () => settingsStorage.getSettings())
    ipcMain.handle('get-default-settings', () => settingsStorage.getDefaults())
    ipcMain.handle('save-settings', (_, settings: any) => {
      settingsStorage.saveSettings(settings)
      // 日志分片大小需实时生效，无需重启
      if (settings.logSplitSize) {
        IpcConnector.getInstance().applySettings({ logSplitSize: settings.logSplitSize })
      }
      // 启用日志存储开关需实时生效
      if (settings.enableLogStorage !== undefined) {
        IpcConnector.getInstance().applySettings({ enableLogStorage: settings.enableLogStorage })
      }
      // 命令历史最大数量变更时裁剪历史记录
      if (settings.commandHistoryMaxCount) {
        commandHistoryStorage.applyMaxCount(settings.commandHistoryMaxCount)
      }
      return true
    })

    ipcMain.handle('get-command-history', (_, protocolType: string) => commandHistoryStorage.getHistory(protocolType))
    ipcMain.handle('add-command-history', (_, protocolType: string, command: string) => {
      commandHistoryStorage.addCommand(protocolType, command)
      return true
    })
    ipcMain.handle('clear-command-history', (_, protocolType: string) => {
      commandHistoryStorage.clearHistory(protocolType)
      return true
    })
    ipcMain.handle('remove-command-history', (_, protocolType: string, command: string) => {
      commandHistoryStorage.removeCommand(protocolType, command)
      return true
    })

    /* 快捷键持久化 */
    const shortcutsStorage = new ShortcutsStorage()
    ipcMain.handle('get-shortcuts', () => shortcutsStorage.getAll())
    ipcMain.handle('get-default-shortcuts', () => shortcutsStorage.getDefaults())
    ipcMain.handle('save-shortcuts', (_, shortcuts: any[]) => {
      shortcutsStorage.saveAll(shortcuts)
      return true
    })
    ipcMain.handle('get-shortcut-actions', () => SHORTCUT_ACTIONS)

    logger.info(`init IpcStorage done`)
  }
}
