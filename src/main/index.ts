import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import logger from './utils/logger'
import IpcStorage from './ipc/IpcStorage'
import IpcTelnet from './ipc/IpcTelnet'
import os from 'os' // 核心：os 模块获取系统内存

app.isQuitting = false
const _logger = new logger()
let isQuitting = false
const windows = {
  mainWindow: undefined as BrowserWindow | undefined
}

IpcStorage.getInstance().init(ipcMain)
IpcTelnet.getInstance().init(ipcMain, _logger, windows)

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
    mainWindow.webContents.executeJavaScript('window.dispatchEvent(new Event("window-maximized"))')
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.executeJavaScript(
      'window.dispatchEvent(new Event("window-unmaximized"))'
    )
  })

  windows.mainWindow = mainWindow
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

// 窗口控制IPC
ipcMain.handle('minimize-window', () => windows.mainWindow?.minimize())
ipcMain.handle('close-window', () => windows.mainWindow?.close())
ipcMain.handle('get-window-state', () => windows.mainWindow?.isMaximized())
ipcMain.handle('maximize-window', () =>
  windows.mainWindow?.isMaximized()
    ? windows.mainWindow?.unmaximize()
    : windows.mainWindow?.maximize()
)
ipcMain.handle('open-devtools', () =>
  windows.mainWindow?.webContents?.isDevToolsOpened()
    ? windows.mainWindow?.webContents?.closeDevTools()
    : windows.mainWindow?.webContents?.openDevTools({ mode: 'right' })
)

ipcMain.handle('get-app-resource', async () => {
  const cpuInfo = process.getCPUUsage()
  const cpuRate = Math.max(0, Math.min(100, cpuInfo.percentCPUUsage)).toFixed(2)
  const memoryInfo = await process.getProcessMemoryInfo()
  const usedMemory = memoryInfo.residentSet
  const totalMemGB = os.totalmem()
  const memRate = ((usedMemory / (totalMemGB / 1024)) * 100).toFixed(2)
  return {
    cpu: cpuRate,
    memory: (usedMemory / 1024).toFixed(2),
    memRate: memRate
  }
})

ipcMain.handle('open-external-url', async (_, url) => await shell.openExternal(url))
