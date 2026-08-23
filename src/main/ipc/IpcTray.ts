import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron'
import { join } from 'path'
import logger from './IpcAppLogger'
import { hideWindow, showAndFocusWindow } from '../../core/tray/WindowVisibility'

export default class IpcTray {
  private static sInstance: IpcTray
  private tray: Tray | null = null
  private trayMenuWindow: BrowserWindow | null = null
  private currentTheme: string = 'dark'

  constructor() {
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
      ? process.resourcesPath              // 打包后: resources/ 目录
      : join(__dirname, '../../build')     // 开发模式: build/ 目录

    if (process.platform === 'win32') {
      return join(basePath, 'icon.ico')
    } else if (process.platform === 'darwin') {
      return join(basePath, 'icon.icns')
    }
    return join(basePath, 'icon.png')
  }

  createTray(mainWindow: BrowserWindow): void {
    if (this.tray) {
      return
    }

    const iconPath = this.getIconPath()
    const icon = nativeImage.createFromPath(iconPath)

    if (icon.isEmpty()) {
      logger.warn(`Tray icon not found at: ${iconPath}, using default icon`)
      this.tray = new Tray(nativeImage.createEmpty())
    } else if (process.platform === 'darwin') {
      // macOS: 使用 16x16 模板图标（系统会自动根据明暗主题调整颜色）
      const trayIcon = icon.resize({ width: 16, height: 16 })
      trayIcon.setTemplateImage(true)
      this.tray = new Tray(trayIcon)
    } else if (process.platform === 'win32') {
      // Windows: 直接使用原始图标，让系统自动选择最佳分辨率
      // .ico 文件内嵌多尺寸，不需要手动 resize
      this.tray = new Tray(icon)
    } else {
      // Linux: 使用适当尺寸的图标
      this.tray = new Tray(icon.resize({ width: 22, height: 22 }))
    }

    this.tray.setToolTip('SuperConnectX')

    // 左键点击托盘图标显示窗口
    this.tray.on('click', () => {
      this.showWindow(mainWindow)
    })

    // 右键点击托盘图标显示自定义菜单窗口
    this.tray.on('right-click', (_event, bounds) => {
      this.showTrayMenuWindow(mainWindow, bounds)
    })

    // macOS 上托盘左键也弹出菜单（兼容 macOS 习惯）
    if (process.platform === 'darwin') {
      // macOS Tray 本身已支持原生菜单，保留原生方式
      const contextMenu = Menu.buildFromTemplate([
        {
          label: '显示窗口',
          click: () => {
            this.showWindow(mainWindow)
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          click: () => {
            (app as any).isQuitting = true
            app.quit()
          }
        }
      ])
      this.tray.setContextMenu(contextMenu)
    }

    logger.info('Tray created successfully')
  }

  private async showTrayMenuWindow(mainWindow: BrowserWindow, bounds: Electron.Rectangle): Promise<void> {
    // 如果菜单窗口已存在，先关闭
    if (this.trayMenuWindow && !this.trayMenuWindow.isDestroyed()) {
      this.trayMenuWindow.close()
      this.trayMenuWindow = null
      return
    }

    // 从主窗口获取当前主题
    try {
      const theme = await mainWindow.webContents.executeJavaScript('document.documentElement.getAttribute("data-theme") || "dark"')
      this.currentTheme = theme
    } catch {
      this.currentTheme = 'dark'
    }

    const menuWidth = 180
    // 计算实际菜单高度：2个菜单项(各32px) + 分割线(1px) + 分割线上下边距(各4px) + 容器padding(上下各4px) + 边框(2px)
    const menuHeight = 2 * 32 + 1 + 2 * 4 + 2 * 4 + 2  // = 81

    // 计算菜单位置（在托盘图标旁边）
    let x = Math.round(bounds.x - menuWidth / 2 + bounds.width / 2)
    let y: number

    if (process.platform === 'darwin') {
      // macOS 托盘在顶部，菜单在图标下方
      y = Math.round(bounds.y + bounds.height + 4)
    } else {
      // Windows/Linux 托盘在底部，菜单在图标上方
      y = Math.round(bounds.y - menuHeight - 4)
    }

    // 确保菜单不超出屏幕边界
    const { screen } = require('electron')
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

    if (x + menuWidth > screenWidth) x = screenWidth - menuWidth - 8
    if (x < 8) x = 8
    if (y + menuHeight > screenHeight) y = screenHeight - menuHeight - 8
    if (y < 8) y = 8

    this.trayMenuWindow = new BrowserWindow({
      width: menuWidth,
      height: menuHeight,
      x,
      y,
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      show: false,
      backgroundColor: this.currentTheme === 'light' ? '#ffffff' : '#2d2d2d',
      webPreferences: {
        sandbox: false,
        contextIsolation: false,
        nodeIntegration: true
      }
    })

    // 加载菜单 HTML（内联渲染，简单场景不需要 Vue）
    const menuHTML = this.getTrayMenuHTML()
    this.trayMenuWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(menuHTML)}`)

    this.trayMenuWindow.once('ready-to-show', () => {
      this.trayMenuWindow?.show()
    })

    // 失焦时自动关闭
    this.trayMenuWindow.on('blur', () => {
      this.closeTrayMenuWindow()
    })
  }

  private getTrayMenuHTML(): string {
    const isLight = this.currentTheme === 'light'
    const bgColor = isLight ? '#ffffff' : '#2d2d2d'
    const textColor = isLight ? '#333333' : '#e0e0e0'
    const borderColor = isLight ? '#d0d0d0' : '#3a3a3a'
    const hoverBg = isLight ? '#e8f4fd' : '#094771'
    const hoverColor = isLight ? '#0e639c' : '#ffffff'
    const dividerColor = isLight ? '#e0e0e0' : '#3a3a3a'
    const dangerColor = isLight ? '#d46060' : '#f56c6c'
    const dangerHoverBg = isLight ? '#d46060' : '#f56c6c'
    const dangerHoverColor = '#ffffff'

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    -webkit-app-region: no-drag;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
    font-size: 13px;
    color: ${textColor};
    background: ${bgColor};
  }
  .tray-menu {
    width: 100%;
    height: 100%;
    background: ${bgColor};
    border: 1px solid ${borderColor};
    border-radius: 8px;
    padding: 4px 0;
    overflow: hidden;
  }
  .menu-item {
    padding: 8px 16px;
    color: ${textColor};
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.15s ease;
    display: flex;
    align-items: center;
    gap: 8px;
    user-select: none;
  }
  .menu-item:hover {
    background-color: ${hoverBg};
    color: ${hoverColor};
  }
  .menu-item:active {
    background-color: ${isLight ? '#cce5ff' : '#073a5c'};
  }
  .menu-item .icon {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  }
  .menu-divider {
    height: 1px;
    background-color: ${dividerColor};
    margin: 4px 0;
  }
  .menu-item.danger {
    color: ${dangerColor};
  }
  .menu-item.danger:hover {
    background-color: ${dangerHoverBg};
    color: ${dangerHoverColor};
  }
</style>
</head>
<body>
  <div class="tray-menu" id="trayMenu">
    <div class="menu-item" id="showWindow">
      <span class="icon">📂</span>
      <span>显示窗口</span>
    </div>
    <div class="menu-divider"></div>
    <div class="menu-item danger" id="quitApp">
      <span class="icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
          <line x1="12" y1="2" x2="12" y2="12"/>
        </svg>
      </span>
      <span>退出</span>
    </div>
  </div>
  <script>
    const { ipcRenderer } = require('electron')
    document.getElementById('showWindow').addEventListener('click', () => {
      ipcRenderer.send('tray-menu-action', 'show-window')
    })
    document.getElementById('quitApp').addEventListener('click', () => {
      ipcRenderer.send('tray-menu-action', 'quit-app')
    })
  </script>
</body>
</html>`
  }

  private closeTrayMenuWindow(): void {
    if (this.trayMenuWindow && !this.trayMenuWindow.isDestroyed()) {
      this.trayMenuWindow.close()
      this.trayMenuWindow = null
    }
  }

  private showWindow(mainWindow: BrowserWindow): void {
    showAndFocusWindow(mainWindow)
  }

  hideToTray(mainWindow: BrowserWindow): void {
    // 创建托盘（如果还没有）
    if (!this.tray) {
      this.createTray(mainWindow)
    }
    // 隐藏窗口
    hideWindow(mainWindow)
    logger.info('Window hidden to tray')
  }

  destroyTray(): void {
    this.closeTrayMenuWindow()
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
      logger.info('Tray destroyed')
    }
  }

  isQuitting(): boolean {
    return (app as any).isQuitting === true
  }
}
