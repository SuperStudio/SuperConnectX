import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow

function createWindow(): void {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200, // 加宽（适配 SSH 终端和配置面板）
    height: 800,
    title: 'SuperSSH',
    autoHideMenuBar: false, // 显示菜单栏（方便操作）
    ...(process.platform === 'linux' ? { icon: join(__dirname, '../../build/icon.png') } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false, // 关闭沙箱（需访问系统资源，如 SSH 连接）
      contextIsolation: true, // 保持隔离（安全最佳实践）
      nodeIntegration: false // 禁用直接 Node 集成，通过 preload 暴露 API
    }
  })

  // 加载界面（开发环境加载 Vite 服务，生产环境加载本地 HTML）
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../../out/renderer/index.html'))
  }

  // 开发模式打开开发者工具
  // if (is.dev) {
  // mainWindow.webContents.openDevTools()
  // }

  // 允许点击链接打开系统浏览器
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
}

// 应用生命周期管理
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.superssh.app') // 应用唯一 ID（打包用）
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
