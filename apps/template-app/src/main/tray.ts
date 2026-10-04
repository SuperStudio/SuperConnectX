/**
 * Tray - 模板应用托盘（业务适配层）
 *
 * 通用托盘运行时在基础层：@superx/foundation/main/tray/TrayManager
 * 本模块只注入模板应用差异点：图标路径、提示文案、退出语义。
 */
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import {
  TrayManager,
  getTrayIconFileName,
  TRAY_ACTION_QUIT_APP
} from '@superx/foundation/main/tray/TrayManager'

let trayManager: TrayManager | null = null

/** 解析托盘图标绝对路径（开发：build/；打包后：resources/） */
function getIconPath(): string {
  const basePath = app.isPackaged ? process.resourcesPath : join(__dirname, '../../build')
  return join(basePath, getTrayIconFileName(process.platform))
}

export function createTray(mainWindow: BrowserWindow): TrayManager {
  if (trayManager) return trayManager
  trayManager = new TrayManager({
    tooltip: 'SuperX Template',
    iconPath: getIconPath(),
    showWindowLabel: '显示窗口',
    quitLabel: '退出',
    onQuit: () => {
      ;(app as any).isQuitting = true
      app.quit()
    }
  })
  trayManager.createTray(mainWindow)
  return trayManager
}

/** 应用退出前清理托盘（注销 IPC 监听、销毁托盘图标） */
export function destroyTray(): void {
  trayManager?.destroyTray()
  trayManager = null
}

/** 是否处于“真正退出”流程（关闭窗口默认隐藏到托盘） */
export function isQuitting(): boolean {
  return (app as any).isQuitting === true
}

export { TRAY_ACTION_QUIT_APP }
