/**
 * IpcTray - SuperConnectX 托盘（业务适配层）
 *
 * 通用托盘运行时（图标平台化处理 / 主题跟随菜单窗口 / 动作分发 /
 * 隐藏到托盘 / IPC 通道管理）已下沉至基础层：
 * @superx/foundation/main/tray/TrayManager
 *
 * 本类只保留应用差异点：
 * - 托盘提示文案与图标路径解析（打包/开发两种布局）
 * - 退出语义（置 isQuitting 标志后退出，供关闭拦截判断）
 * - 应用日志
 */
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import logger from './IpcAppLogger'
import { TrayManager, getTrayIconFileName } from '@superx/foundation/main/tray/TrayManager'

export { getTrayIconFileName }

export default class IpcTray {
  private static sInstance: IpcTray
  private manager: TrayManager

  private constructor() {
    this.manager = new TrayManager({
      tooltip: 'SuperConnectX',
      iconPath: this.getIconPath(),
      showWindowLabel: '显示窗口',
      quitLabel: '退出',
      onQuit: () => {
        ;(app as any).isQuitting = true
        app.quit()
      },
      logger
    })
  }

  static getInstance(): IpcTray {
    if (IpcTray.sInstance == null) {
      IpcTray.sInstance = new IpcTray()
    }
    return IpcTray.sInstance
  }

  private getIconPath(): string {
    // 根据平台返回图标路径
    const basePath = app.isPackaged
      ? process.resourcesPath // 打包后: resources/ 目录
      : join(__dirname, '../../build') // 开发模式: build/ 目录

    return join(basePath, getTrayIconFileName(process.platform))
  }

  createTray(mainWindow: BrowserWindow): void {
    this.manager.createTray(mainWindow)
  }

  hideToTray(mainWindow: BrowserWindow): void {
    this.manager.hideToTray(mainWindow)
  }

  destroyTray(): void {
    this.manager.destroyTray()
  }

  isQuitting(): boolean {
    return (app as any).isQuitting === true
  }
}
