import { app, BrowserWindow, shell, ipcMain, dialog, powerSaveBlocker } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import logger from './IpcAppLogger'
import { printAppInfo } from '../utils/PrintAppInfo'
import IpcTray from './IpcTray'
import IpcConnector from './IpcConnector'
import SettingsStorage from '../storage/SettingsStorage'
import AppSettingsStorage from '../storage/AppSettingsStorage'
import BackupManager from '../utils/BackupManager'
import fs from 'fs'
import path from 'path'
import { WINDOW_IPC_CHANNELS } from '../../shared/ipc/window'

(app as any).isQuitting = false
let isQuitting = false
let quitCleanupStarted = false
let powerBlockerId: number | null = null

const packageJsonPath = path.join(app.getAppPath(), 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

export function getWindowFrameOptions(platform: NodeJS.Platform) {
  return platform === 'darwin'
    ? {
        frame: true,
        titleBarStyle: 'hiddenInset' as const,
        trafficLightPosition: { x: 12, y: 9 }
      }
    : {
        frame: false,
        titleBarStyle: 'hidden' as const
      }
}

export function getWindowCloseAction(
  platform: NodeJS.Platform,
  minimizeToTray: boolean
): 'hide' | 'quit' | 'close' {
  if (minimizeToTray) return 'hide'
  return platform === 'darwin' ? 'quit' : 'close'
}

export default class IpcMain {
  private static sInstance: IpcMain
  private settingsStorage: SettingsStorage
  private appSettingsStorage: AppSettingsStorage

  constructor() {
    this.settingsStorage = new SettingsStorage()
    this.appSettingsStorage = new AppSettingsStorage()
  }

  static getInstance(): IpcMain {
    if (IpcMain.sInstance == null) {
      IpcMain.sInstance = new IpcMain()
    }

    return IpcMain.sInstance
  }

  init(_logger, windows): void {
    function createWindow(): void {
      // 创建浏览器窗口
      const mainWindow = new BrowserWindow({
        width: 1200, // 加宽（适配 SSH 终端和配置面板）
        height: 800,
        minWidth: 800, // 最小宽度（防止过窄）
        minHeight: 600, // 最小高度
        title: 'SuperConnectX',
        autoHideMenuBar: false, // 显示菜单栏（方便操作）
        backgroundColor: '#1e1e1e', // 防止最小化时白色闪烁（Windows 11）
        ...(process.platform === 'win32'
          ? { icon: join(__dirname, '../../build/icon.ico') }
          : process.platform === 'linux'
            ? { icon: join(__dirname, '../../build/icon.png') }
            : {}),
        // 禁用后台节流，防止切回前台时卡顿
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false, // 关闭沙箱（需访问系统资源，如 SSH 连接）
          contextIsolation: true, // 保持隔离（安全最佳实践）
          nodeIntegration: false, // 禁用直接 Node 集成，通过 preload 暴露 API
          backgroundThrottling: false // 禁用后台节流，防止切换窗口时卡顿
        },
        ...getWindowFrameOptions(process.platform)
      })

      // 加载界面（开发环境加载 Vite 服务，生产环境加载本地 HTML）
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
      } else {
        mainWindow.loadFile(join(__dirname, '../../out/renderer/index.html'))
      }

      // 允许点击链接打开系统浏览器
      mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
      })

      // 监听窗口最大化状态变化（多事件兜底，兼容 Ubuntu 24 等 Linux 窗口管理器）
      // 仅在状态真正变化时才通知渲染进程，避免 resize 事件风暴期间频繁 IPC。
      let lastMaximized: boolean | null = null
      const dispatchMaximizeState = () => {
        const maximized = mainWindow.isMaximized()
        if (maximized === lastMaximized) return
        lastMaximized = maximized
        if (mainWindow.isDestroyed()) return
        mainWindow.webContents.send(WINDOW_IPC_CHANNELS.maximizedChanged, maximized)
      }
      mainWindow.on('maximize', dispatchMaximizeState)
      mainWindow.on('unmaximize', dispatchMaximizeState)
      // resize 事件兜底：某些 Linux 桌面环境（如 GNOME on Ubuntu 24）可能不触发 unmaximize
      mainWindow.on('resize', dispatchMaximizeState)

      // 监听窗口关闭事件
      mainWindow.on('close', (event) => {
        const settings = IpcMain.getInstance().settingsStorage.getSettings()
        const closeAction = getWindowCloseAction(process.platform, settings.minimizeToTray === true)
        // 如果设置了关闭后最小化到托盘，并且不是真正退出，则阻止关闭并隐藏
        if (closeAction === 'hide' && !isQuitting) {
          event.preventDefault()
          mainWindow.hide()
        } else if (closeAction === 'quit' && !isQuitting) {
          // 关闭到托盘未启用时退出，避免窗口消失后串口仍被后台进程持有。
          event.preventDefault()
          app.quit()
        }
      })

      windows.mainWindow = mainWindow

      // 创建托盘
      IpcTray.getInstance().createTray(mainWindow)

      mainWindow.webContents.on('did-finish-load', () => {
        printAppInfo(mainWindow)
      })
    }

    // 应用生命周期管理
    app.whenReady().then(() => {
      electronApp.setAppUserModelId('superconnectx.superstudio') // 应用唯一 ID（打包用）
      app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
      })
      createWindow()
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
      })
      // 初始化防止休眠功能
      this.initPreventSleep()
      // 监听设置变化
      ipcMain.on('settings-updated', (_, settings) => {
        this.setPreventSleep(settings.preventSleep === true)
      })
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })

    app.on('before-quit', async (event) => {
      if (quitCleanupStarted) return
      event.preventDefault()
      quitCleanupStarted = true
      isQuitting = true
      ;(app as any).isQuitting = true
      try {
        _logger.flush()
        await IpcConnector.getInstance().cleanup()
        IpcTray.getInstance().destroyTray()
        this.performAutoBackupOnExit()
      } finally {
        app.quit()
      }
    })

    // 进程信号监听
    process.on('SIGINT', () => {
      if (isQuitting) return
      isQuitting = true
      ;(app as any).isQuitting = true

      _logger.flush()
      process.exit(0)
    })

    process.on('SIGTERM', () => {
      if (isQuitting) return
      isQuitting = true
      ;(app as any).isQuitting = true

      _logger.flush()
      process.exit(0)
    })

    // 文件选择对话框
    ipcMain.handle('open-file-dialog', async (_, options) => {
      const mainWindow = BrowserWindow.getFocusedWindow()
      if (mainWindow) {
        return await dialog.showOpenDialog(mainWindow, options)
      }
      return { filePaths: [] }
    })

    // 保存文件对话框（自动记忆上次保存目录）
    ipcMain.handle('save-file-dialog', async (_, options) => {
      const mainWindow = BrowserWindow.getFocusedWindow()
      if (!mainWindow) return { filePath: null }

      const opts = { ...options }
      const lastDir = this.appSettingsStorage.getSettings().lastSaveDir
      if (lastDir && opts.defaultPath && path.dirname(opts.defaultPath) === '.') {
        opts.defaultPath = path.join(lastDir, opts.defaultPath)
      }

      const result = await dialog.showSaveDialog(mainWindow, opts)
      if (result.filePath) {
        this.appSettingsStorage.saveSettings({ lastSaveDir: path.dirname(result.filePath) })
      }
      return result
    })

    // 目录选择对话框
    ipcMain.handle('open-directory-dialog', async (_, options) => {
      const mainWindow = BrowserWindow.getFocusedWindow()
      if (mainWindow) {
        return await dialog.showOpenDialog(mainWindow, {
          properties: ['openDirectory'],
          ...options
        })
      }
      return { filePaths: [] }
    })

    // ========== 自动更新 IPC ==========
    // electron-updater 默认不加载，避免在公司内网代理环境触发告警
    // 前端在调用 checkForUpdates 前应先弹出确认框

    let updaterLoaded = false
    const ensureUpdater = async () => {
      if (updaterLoaded) {
        const { default: AppUpdater } = await import('../updater/AppUpdater')
        return AppUpdater
      }
      return null
    }

    ipcMain.handle('check-for-updates', async () => {
      const mainWindow = windows.mainWindow
      if (!mainWindow) return

      // 动态加载 electron-updater
      const { default: AppUpdater } = await import('../updater/AppUpdater')
      if (!updaterLoaded) {
        AppUpdater.getInstance().init(mainWindow)
        updaterLoaded = true
      }
      await AppUpdater.getInstance().checkForUpdates()
    })

    ipcMain.handle('start-download', async () => {
      const AppUpdater = await ensureUpdater()
      if (!AppUpdater) return
      await AppUpdater.getInstance().startDownload()
    })

    ipcMain.handle('quit-and-install', async () => {
      const AppUpdater = await ensureUpdater()
      if (!AppUpdater) return
      AppUpdater.getInstance().quitAndInstall()
    })

    ipcMain.handle('cancel-download', async () => {
      const AppUpdater = await ensureUpdater()
      if (!AppUpdater) return
      AppUpdater.getInstance().cancelDownload()
    })

    ipcMain.handle('get-cached-update-info', async () => {
      const AppUpdater = await ensureUpdater()
      if (!AppUpdater) return null
      return AppUpdater.getInstance().cachedUpdateInfo
    })

    // 托盘菜单操作 IPC
    ipcMain.on('tray-menu-action', (_event, action: string) => {
      if (action === 'show-window') {
        if (windows.mainWindow) {
          if (windows.mainWindow.isMinimized()) {
            windows.mainWindow.restore()
          }
          windows.mainWindow.show()
          windows.mainWindow.focus()
        }
      } else if (action === 'quit-app') {
        (app as any).isQuitting = true
        app.quit()
      }
    })

    logger.info(`init IpcMain done`)
  }

  // 防止屏幕息屏及系统休眠
  private setPreventSleep(enabled: boolean): void {
    if (enabled) {
      if (powerBlockerId === null || !powerSaveBlocker.isStarted(powerBlockerId)) {
        powerBlockerId = powerSaveBlocker.start('prevent-display-sleep')
        logger.info(`Prevent sleep enabled, blocker id: ${powerBlockerId}`)
      }
    } else {
      if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
        powerSaveBlocker.stop(powerBlockerId)
        logger.info(`Prevent sleep disabled, blocker id: ${powerBlockerId}`)
      }
      powerBlockerId = null
    }
  }

  // 初始化防止休眠功能（检查设置）
  private initPreventSleep(): void {
    const settings = this.settingsStorage.getSettings()
    if (settings.preventSleep) {
      this.setPreventSleep(true)
    }
  }

  // 退出时执行自动备份（用户数据已保存后）
  private performAutoBackupOnExit(): void {
    try {
      const settings = this.settingsStorage.getSettings()
      if (settings.autoBackup && settings.backupInterval) {
        logger.info(`[AutoBackup] performing backup on exit, interval: ${settings.backupInterval} days`)
        BackupManager.getInstance().performBackup(settings.backupInterval)
      }
    } catch (error) {
      logger.error(`[AutoBackup] backup on exit failed:`, error)
    }
  }

  getVersionInfo = () => {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions?.electron,
      electronVersionFromPackage: packageJson.devDependencies?.electron?.replace(/^\^|~/, ''), // 去掉版本前缀 ^/~
      vueVersion: packageJson.dependencies?.vue?.replace(/^\^|~/, ''),
      nodeVersion: process.versions?.node,
      chromeVersion: process.versions?.chrome,
      appName: app.getName()
    }
  }
}
