import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import logger from './IpcAppLogger'
import { printAppInfo } from '../utils/PrintAppInfo'
import fs from 'fs'
import path from 'path'

app.isQuitting = false
let isQuitting = false

const packageJsonPath = path.join(app.getAppPath(), 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

export default class IpcMain {
  private static sInstance: IpcMain

  constructor() {}

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
        ...(process.platform === 'linux' ? { icon: join(__dirname, '../../build/icon.png') } : {}),
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false, // 关闭沙箱（需访问系统资源，如 SSH 连接）
          contextIsolation: true, // 保持隔离（安全最佳实践）
          nodeIntegration: false // 禁用直接 Node 集成，通过 preload 暴露 API
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

      windows.mainWindow = mainWindow

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
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })

    app.on('window-all-closed', async () => {
      if (isQuitting) return
      isQuitting = true
      app.isQuitting = true

      _logger.flush()

      setTimeout(() => {
        if (process.platform !== 'darwin') {
          app.quit()
        }
      }, 300)
    })

    app.on('before-quit', (event) => {
      if (isQuitting) return
      isQuitting = true
      app.isQuitting = true
      _logger.flush()
    })

    // 进程信号监听
    process.on('SIGINT', () => {
      if (isQuitting) return
      isQuitting = true
      app.isQuitting = true

      _logger.flush()
      process.exit(0)
    })

    process.on('SIGTERM', () => {
      if (isQuitting) return
      isQuitting = true
      app.isQuitting = true

      _logger.flush()
      process.exit(0)
    })

    logger.info(`init IpcMain done`)
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
