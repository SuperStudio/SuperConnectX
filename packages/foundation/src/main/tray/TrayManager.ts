/**
 * TrayManager - 系统托盘通用运行时（基础层 / 主进程）
 *
 * 提供 SuperStudio 桌面应用托盘的标准行为，与业务零耦合：
 * - 平台化图标处理（win32 多尺寸 .ico 原样 / darwin 模板图 / linux 缩放 22px）
 * - 左键点击显示主窗口；右键弹出自绘菜单窗口（跟随主题、失焦自动关闭）
 * - macOS 保留原生上下文菜单（平台习惯）
 * - 「显示窗口 / 退出」为内置动作，文案可配置；额外动作经 onAction 注入
 * - 菜单窗口经 IPC 通道 tray-menu-action 回传动作 id，由本管理器统一分发
 * - hideToTray（隐藏到托盘并确保托盘存在）/ destroyTray（销毁并注销监听）
 *
 * 应用侧需注入的差异点（IAdapter 模式）：
 * - iconPath：图标绝对路径（依赖 app 打包布局，只能由应用解析）
 * - tooltip：托盘提示文案
 * - onQuit：退出语义（如置 isQuitting 标志后 app.quit()）
 * - getTheme：菜单主题探测（默认从主窗口 data-theme 属性读取）
 */
import { Tray, Menu, nativeImage, BrowserWindow, ipcMain, screen } from 'electron'
import { showAndFocusWindow, hideWindow, type VisibilityWindow } from './WindowVisibility'

/** 托盘菜单窗口 → 主进程 的动作回传通道（菜单 HTML 内联脚本使用 ipcRenderer.send） */
export const TRAY_MENU_ACTION_CHANNEL = 'tray-menu-action'

/** 内置动作 id：显示主窗口 */
export const TRAY_ACTION_SHOW_WINDOW = 'show-window'
/** 内置动作 id：退出应用 */
export const TRAY_ACTION_QUIT_APP = 'quit-app'

/** 托盘图标文件名约定（按平台） */
export function getTrayIconFileName(platform: NodeJS.Platform): string {
  if (platform === 'win32') return 'icon.ico'
  if (platform === 'darwin') return 'iconTemplate.png'
  return 'icon.png'
}

export interface TrayMenuItem {
  /** 动作 id，经 tray-menu-action 通道回传给 onAction */
  id: string
  label: string
  /** 危险动作样式（红色文字） */
  danger?: boolean
  /** 内联 SVG 图标（16x16） */
  iconSvg?: string
}

export interface TrayManagerOptions {
  /** 托盘提示文案 */
  tooltip: string
  /** 图标绝对路径（应用侧解析打包/开发布局后注入） */
  iconPath: string
  /** 显示窗口菜单项文案 */
  showWindowLabel?: string
  /** 退出菜单项文案 */
  quitLabel?: string
  /** 额外菜单项（渲染在内置两项之间之后、退出之前） */
  extraItems?: TrayMenuItem[]
  /** 退出动作（应用注入退出语义：置标志、清理后退出） */
  onQuit: () => void
  /** 额外动作分发（extraItems 的 id）；内置动作不走这里 */
  onAction?: (actionId: string) => void
  /** 主题探测：决定菜单窗口配色，默认从主窗口 data-theme 读取 */
  getTheme?: () => Promise<'light' | 'dark'>
  /** 可选日志（info/warn） */
  logger?: { info: (message: string) => void; warn: (message: string) => void }
}

export class TrayManager {
  private tray: Tray | null = null
  private trayMenuWindow: BrowserWindow | null = null
  private mainWindow: BrowserWindow | null = null
  private currentTheme: 'light' | 'dark' = 'dark'
  private readonly options: TrayManagerOptions

  constructor(options: TrayManagerOptions) {
    this.options = options
  }

  /** 当前托盘是否已创建 */
  isCreated(): boolean {
    return this.tray !== null
  }

  createTray(mainWindow: BrowserWindow): void {
    if (this.tray) return
    this.mainWindow = mainWindow

    const icon = nativeImage.createFromPath(this.options.iconPath)
    if (icon.isEmpty()) {
      this.options.logger?.warn(`Tray icon not found at: ${this.options.iconPath}, using default icon`)
      this.tray = new Tray(nativeImage.createEmpty())
    } else if (process.platform === 'darwin') {
      icon.setTemplateImage(true)
      this.tray = new Tray(icon)
    } else if (process.platform === 'win32') {
      // Windows: 直接使用原始图标，让系统自动选择最佳分辨率
      // .ico 文件内嵌多尺寸，不需要手动 resize
      this.tray = new Tray(icon)
    } else {
      // Linux: 使用适当尺寸的图标
      this.tray = new Tray(icon.resize({ width: 22, height: 22 }))
    }

    this.tray.setToolTip(this.options.tooltip)

    // 左键点击托盘图标显示窗口
    this.tray.on('click', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        showAndFocusWindow(this.mainWindow)
      }
    })

    // 右键点击托盘图标显示自定义菜单窗口
    this.tray.on('right-click', (_event, bounds) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.showTrayMenuWindow(bounds)
      }
    })

    // macOS 保留原生菜单（平台习惯）
    if (process.platform === 'darwin') {
      const items = this.getMenuItems()
      const contextMenu = Menu.buildFromTemplate([
        {
          label: items.find((i) => i.id === TRAY_ACTION_SHOW_WINDOW)!.label,
          click: () => this.dispatch(TRAY_ACTION_SHOW_WINDOW)
        },
        { type: 'separator' },
        {
          label: items.find((i) => i.id === TRAY_ACTION_QUIT_APP)!.label,
          click: () => this.dispatch(TRAY_ACTION_QUIT_APP)
        }
      ])
      this.tray.setContextMenu(contextMenu)
    }

    // 菜单窗口动作分发（自绘菜单 HTML 内 ipcRenderer.send 到本通道）
    ipcMain.on(TRAY_MENU_ACTION_CHANNEL, (_event, action: string) => {
      this.dispatch(action)
    })

    this.options.logger?.info('Tray created successfully')
  }

  /** 隐藏到托盘（托盘不存在时自动创建） */
  hideToTray(mainWindow: BrowserWindow): void {
    this.mainWindow = this.mainWindow ?? mainWindow
    if (!this.tray) {
      this.createTray(mainWindow)
    }
    hideWindow(mainWindow)
    this.options.logger?.info('Window hidden to tray')
  }

  /** 销毁托盘与菜单窗口，注销 IPC 监听（应用退出清理时调用） */
  destroyTray(): void {
    this.closeTrayMenuWindow()
    ipcMain.removeAllListeners(TRAY_MENU_ACTION_CHANNEL)
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
      this.options.logger?.info('Tray destroyed')
    }
  }

  // ---- 内部实现 ----

  /** 组装菜单项列表：显示窗口 + extraItems + 分隔 + 退出 */
  private getMenuItems(): TrayMenuItem[] {
    return [
      { id: TRAY_ACTION_SHOW_WINDOW, label: this.options.showWindowLabel ?? '显示窗口' },
      ...(this.options.extraItems ?? []),
      { id: TRAY_ACTION_QUIT_APP, label: this.options.quitLabel ?? '退出', danger: true }
    ]
  }

  /** 统一动作分发：内置两项走内置行为，其余走 onAction */
  private dispatch(actionId: string): void {
    if (actionId === TRAY_ACTION_SHOW_WINDOW) {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        showAndFocusWindow(this.mainWindow)
      }
      return
    }
    if (actionId === TRAY_ACTION_QUIT_APP) {
      this.options.onQuit()
      return
    }
    this.options.onAction?.(actionId)
  }

  private async resolveTheme(): Promise<'light' | 'dark'> {
    if (this.options.getTheme) {
      try {
        return (await this.options.getTheme()) === 'light' ? 'light' : 'dark'
      } catch {
        return 'dark'
      }
    }
    // 默认：从主窗口渲染进程读取 data-theme 属性（SuperStudio 应用主题约定）
    try {
      const theme = await this.mainWindow?.webContents.executeJavaScript(
        'document.documentElement.getAttribute("data-theme") || "dark"'
      )
      return theme === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  }

  private async showTrayMenuWindow(bounds: Electron.Rectangle): Promise<void> {
    // 已打开则关闭（第二次右键视为关闭菜单）
    if (this.trayMenuWindow && !this.trayMenuWindow.isDestroyed()) {
      this.trayMenuWindow.close()
      this.trayMenuWindow = null
      return
    }

    this.currentTheme = await this.resolveTheme()

    const items = this.getMenuItems()
    const menuWidth = 180
    // 实际菜单高度：每项 32px + 分割线(1px) + 分割线上下边距(各4px) + 容器padding(上下各4px) + 边框(2px)
    const menuHeight = items.length * 32 + 1 + 2 * 4 + 2 * 4 + 2

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
    const menuHTML = this.getTrayMenuHTML(items)
    this.trayMenuWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(menuHTML)}`)

    this.trayMenuWindow.once('ready-to-show', () => {
      this.trayMenuWindow?.show()
    })

    // 失焦时自动关闭
    this.trayMenuWindow.on('blur', () => {
      this.closeTrayMenuWindow()
    })
  }

  private getTrayMenuHTML(items: TrayMenuItem[]): string {
    const isLight = this.currentTheme === 'light'
    const bgColor = isLight ? '#ffffff' : '#2d2d2d'
    const textColor = isLight ? '#333333' : '#e0e0e0'
    const borderColor = isLight ? '#d0d0d0' : '#3a3a3a'
    const hoverBg = isLight ? '#e8f4fd' : '#094771'
    const hoverColor = isLight ? '#0e639c' : '#ffffff'
    const dividerColor = isLight ? '#e0e0e0' : '#3a3a3a'
    const dangerColor = isLight ? '#d46060' : '#f56c6c'
    const dangerHoverColor = '#ffffff'

    const defaultShowIcon =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'
    const defaultQuitIcon =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>'

    const itemHtml = items
      .map((item, index) => {
        const icon =
          item.iconSvg ??
          (item.id === TRAY_ACTION_SHOW_WINDOW
            ? defaultShowIcon
            : item.id === TRAY_ACTION_QUIT_APP
              ? defaultQuitIcon
              : '')
        // 退出（最后一项）之前渲染分割线
        const divider =
          index === items.length - 1
            ? '<div class="menu-divider"></div>'
            : ''
        return `${divider}<div class="menu-item${item.danger ? ' danger' : ''}" data-action="${item.id}">
      <span class="icon">${icon}</span>
      <span>${item.label}</span>
    </div>`
      })
      .join('')

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
    background-color: ${dangerColor};
    color: ${dangerHoverColor};
  }
</style>
</head>
<body>
  <div class="tray-menu" id="trayMenu">
    ${itemHtml}
  </div>
  <script>
    const { ipcRenderer } = require('electron')
    document.querySelectorAll('.menu-item[data-action]').forEach((el) => {
      el.addEventListener('click', () => {
        ipcRenderer.send('${TRAY_MENU_ACTION_CHANNEL}', el.dataset.action)
      })
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
}

export type { VisibilityWindow }
