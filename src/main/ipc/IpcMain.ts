import { app, BrowserWindow, shell, ipcMain, dialog, powerSaveBlocker } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import logger from './IpcAppLogger'
import { printAppInfo } from '../utils/PrintAppInfo'
import IpcTray from './IpcTray'
import IpcConnector from './IpcConnector'
import SettingsStorage from '../storage/SettingsStorage'
import BackupManager from '../utils/BackupManager'
import AppUpdater from '../updater/AppUpdater'
import fs from 'fs'
import path from 'path'

(app as any).isQuitting = false
let isQuitting = false
let powerBlockerId: number | null = null

const packageJsonPath = path.join(app.getAppPath(), 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

export default class IpcMain {
  private static sInstance: IpcMain
  private settingsStorage: SettingsStorage

  constructor() {
    this.settingsStorage = new SettingsStorage()
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
        ...(process.platform === 'linux' ? { icon: join(__dirname, '../../build/icon.png') } : {}),
        // 禁用后台节流，防止切回前台时卡顿
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false, // 关闭沙箱（需访问系统资源，如 SSH 连接）
          contextIsolation: true, // 保持隔离（安全最佳实践）
          nodeIntegration: false, // 禁用直接 Node 集成，通过 preload 暴露 API
          backgroundThrottling: false // 禁用后台节流，防止切换窗口时卡顿
        },
        frame: false, // 无边框
        titleBarStyle: 'hidden' // 隐藏标题栏
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

      // 监听窗口最大化状态变化
      mainWindow.on('maximize', () => {
        mainWindow.webContents.executeJavaScript(
          'window.dispatchEvent(new Event("window-maximized"))'
        )
      })

      mainWindow.on('unmaximize', () => {
        mainWindow.webContents.executeJavaScript(
          'window.dispatchEvent(new Event("window-unmaximized"))'
        )
      })

      // 监听窗口关闭事件
      mainWindow.on('close', (event) => {
        const settings = IpcMain.getInstance().settingsStorage.getSettings()
        // 如果设置了关闭后最小化到托盘，并且不是真正退出，则阻止关闭并隐藏
        if (settings.minimizeToTray && !isQuitting) {
          event.preventDefault()
          mainWindow.hide()
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

    app.on('window-all-closed', async () => {
      if (isQuitting) return
      isQuitting = true
      ;(app as any).isQuitting = true

      _logger.flush()

      setTimeout(() => {
        if (process.platform !== 'darwin') {
          app.quit()
        }
      }, 300)
    })

    app.on('before-quit', async (_event) => {
      if (isQuitting) return
      isQuitting = true
      ;(app as any).isQuitting = true
      _logger.flush()
      // 关闭所有 Worker 连接
      await IpcConnector.getInstance().cleanup()
      // 真正退出时销毁托盘
      IpcTray.getInstance().destroyTray()
      // 退出时执行自动备份（用户数据已保存）
      this.performAutoBackupOnExit()
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

    // 保存文件对话框
    ipcMain.handle('save-file-dialog', async (_, options) => {
      const mainWindow = BrowserWindow.getFocusedWindow()
      if (mainWindow) {
        return await dialog.showSaveDialog(mainWindow, options)
      }
      return { filePath: null }
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
    ipcMain.handle('check-for-updates', async () => {
      await AppUpdater.getInstance().checkForUpdates()
    })

    ipcMain.handle('start-download', async () => {
      await AppUpdater.getInstance().startDownload()
    })

    ipcMain.handle('quit-and-install', () => {
      AppUpdater.getInstance().quitAndInstall()
    })

    ipcMain.handle('cancel-download', () => {
      AppUpdater.getInstance().cancelDownload()
    })

    ipcMain.handle('get-cached-update-info', () => {
      return AppUpdater.getInstance().cachedUpdateInfo
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
