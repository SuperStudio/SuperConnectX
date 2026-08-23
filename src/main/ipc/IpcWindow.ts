import { ipcMain, app } from 'electron'
import logger from './IpcAppLogger'
import SettingsStorage from '../storage/SettingsStorage'
import IpcTray from './IpcTray'
import { registerWindowControls } from '../../core/window/WindowControls'

export default class IpcWindow {
  private static sInstance: IpcWindow
  private settingsStorage: SettingsStorage

  constructor() {
    this.settingsStorage = new SettingsStorage()
  }

  static getInstance(): IpcWindow {
    if (IpcWindow.sInstance == null) {
      IpcWindow.sInstance = new IpcWindow()
    }

    return IpcWindow.sInstance
  }

  init(windows): void {
    registerWindowControls({
      ipc: ipcMain,
      getWindow: () => windows.mainWindow,
      getAppVersion: () => app.getVersion(),
      onClose: (mainWindow) => {
        const settings = this.settingsStorage.getSettings()
        if (settings.minimizeToTray) {
          // 隐藏到托盘而不是关闭
          IpcTray.getInstance().hideToTray(mainWindow as any)
        } else {
          mainWindow.close()
        }
      }
    })

    logger.info(`init IpcWindow done`)
  }
}
