import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store' // v3 版本在这里可以正常访问 app 模块
import { Telnet } from 'telnet-client' // 导入telnet客户端

let mainWindow: BrowserWindow

// 存储活跃的Telnet连接
const telnetConnections = new Map<number, Telnet>()

function createWindow(): void {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200, // 加宽（适配 SSH 终端和配置面板）
    height: 800,
    title: 'SuperConnectX',
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
  if (is.dev) {
    mainWindow.webContents.openDevTools()
  }

  // 允许点击链接打开系统浏览器
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
}

// 应用生命周期管理
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.superconnectx.app') // 应用唯一 ID（打包用）
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

// 初始化存储
const connectionStore = new Store({
  name: 'connections',
  cwd: 'super-ssh',
  defaults: {
    connections: []
  }
})

// 监听渲染进程的 IPC 调用
ipcMain.handle('get-connections', () => {
  return connectionStore.get('connections')
})

ipcMain.handle('add-connection', (_, conn: any) => {
  const connections = connectionStore.get('connections') as any[]
  const newId = connections.length ? Math.max(...connections.map((c) => c.id)) + 1 : 1
  const newConn = { id: newId, ...conn }
  connections.push(newConn)
  connectionStore.set('connections', connections)
  return newConn
})

ipcMain.handle('delete-connection', (_, id: number) => {
  const connections = connectionStore.get('connections') as any[]
  const newConnections = connections.filter((c) => c.id !== id)
  connectionStore.set('connections', newConnections)
  return newConnections
})

// 添加Telnet连接处理
ipcMain.handle('connect-telnet', async (_, conn: any) => {
  const connection = new Telnet()
  try {
    const params = {
      host: conn.host,
      port: conn.port || 23,
      timeout: 10000, // 10秒超时（必加！）
      negotiationMandatory: false, // 禁用强制协议协商（很多服务器不支持）
      echoLines: 0, // 禁用回声（避免重复输出）
      terminalType: 'vt100', // 终端类型（cmd 中默认常用 vt100）
      stripShellPrompt: false // 不剥离shell提示符（避免干扰连接）
    }

    await connection.connect(params) // 现在超时后会抛出错误，不会一直卡着
    // 存储连接引用
    telnetConnections.set(conn.id, connection)
    // 监听数据事件并转发到渲染进程
    connection.on('data', (data) => {
      mainWindow.webContents.send('telnet-data', {
        connId: conn.id,
        data: data.toString()
      })
    })

    // 监听连接关闭事件
    connection.on('close', () => {
      mainWindow.webContents.send('telnet-close', conn.id)
      telnetConnections.delete(conn.id)
    })

    return { success: true, message: '连接成功', connId: conn.id }
  } catch (error) {
    console.error(error)
    return {
      success: false,
      message: error instanceof Error ? error.message : '连接失败'
    }
  }
})

// 发送命令到Telnet服务器
ipcMain.handle(
  'telnet-send',
  async (_, { connId, command }: { connId: number; command: string }) => {
    console.log('enter telnet-send')
    const connection = telnetConnections.get(connId)
    if (!connection) {
      return { success: false, message: '连接不存在' }
    }

    try {
      await connection.send(command + '\n')
      return { success: true }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '发送命令失败'
      }
    }
  }
)

// 关闭Telnet连接
ipcMain.handle('telnet-disconnect', async (_, connId: number) => {
  const connection = telnetConnections.get(connId)
  if (connection) {
    await connection.end()
    telnetConnections.delete(connId)
  }
  return { success: true }
})
