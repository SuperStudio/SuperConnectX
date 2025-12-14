import { ipcMain } from 'electron'
import logger from './IpcAppLogger'

export default class IpcWindow {
  private static sInstance: IpcWindow

  constructor() {}

  static getInstance(): IpcWindow {
    if (IpcWindow.sInstance == null) {
      IpcWindow.sInstance = new IpcWindow()
    }

    return IpcWindow.sInstance
  }

  init(windows): void {
    // 窗口控制IPC
    ipcMain.handle('minimize-window', () => windows.mainWindow?.minimize())
    ipcMain.handle('close-window', () => windows.mainWindow?.close())
    ipcMain.handle('get-window-state', () => windows.mainWindow?.isMaximized())
    ipcMain.handle('maximize-window', () =>
      windows.mainWindow?.isMaximized()
        ? windows.mainWindow?.unmaximize()
        : windows.mainWindow?.maximize()
    )

    logger.info(`init IpcWindow done`)
  }
}
