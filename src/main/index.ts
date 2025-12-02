import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store' // v3 版本在这里可以正常访问 app 模块
import { Telnet } from 'telnet-client' // 导入telnet客户端
import { appendFile, existsSync, mkdirSync } from 'fs' // 导入文件系统模块
import fs from 'fs'

// 确保日志目录存在
const logDir = join(app.getPath('userData'), 'logs')
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true })
}

// 获取当前日期的日志文件名
const getLogFileName = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.log`
}

// 写入日志到文件
const writeToLog = (connId: number, data: string, isOutgoing: boolean = false) => {
  const logFile = join(logDir, getLogFileName())
  const timestamp = new Date().toISOString()
  const direction = isOutgoing ? 'SEND' : 'RECV'
  const logEntry = `[${timestamp}] [Conn ${connId}] [${direction}] ${data}\n`

  appendFile(logFile, logEntry, (err) => {
    if (err) {
      console.error('写入日志失败:', err)
    }
  })
}

// 新增：IPC 监听「打开日志」请求
ipcMain.handle('open-telnet-log', async () => {
  try {
    // 1. 拼接当前日志文件路径
    const logFileName = getLogFileName()
    const logFilePath = join(logDir, logFileName)
    console.log('尝试打开日志文件：', logFilePath)

    // 2. 检查日志文件是否存在（不存在则创建空文件）
    if (!existsSync(logDir)) {
      return { success: false, message: '日志目录不存在' }
    }
    if (!existsSync(logFilePath)) {
      // 创建空日志文件（避免打开目录时找不到文件）
      await fs.promises.writeFile(logFilePath, '', 'utf-8')
      console.log('日志文件不存在，已创建空文件')
    }

    // 3. 打开日志目录并选中文件（全平台兼容）
    // shell.showItemInFolder：打开文件所在目录并高亮选中文件
    await shell.showItemInFolder(logFilePath)
    return { success: true }
  } catch (error) {
    console.error('打开日志失败:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : '打开日志文件失败'
    }
  }
})

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

  // 开发模式打开开发者工具
  if (is.dev) {
    mainWindow.webContents.openDevTools()
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
  connectionStore.set('connections', connections as never[])
  return newConn
})

ipcMain.handle('delete-connection', (_, id: number) => {
  const connections = connectionStore.get('connections') as any[]
  const newConnections = connections.filter((c) => c.id !== id)
  connectionStore.set('connections', newConnections as never[])
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
      const dataStr = data.toString()
      writeToLog(conn.id, dataStr)
      mainWindow.webContents.send('telnet-data', {
        connId: conn.id,
        data: dataStr
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
      writeToLog(connId, command, true)
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
  console.log('enter telnet-disconnect connId:', connId)
  console.log('all connection id: ', Array.from(telnetConnections.keys()))
  const connection = telnetConnections.get(connId)
  if (connection) {
    console.warn('start end connection', connId)
    connection.destroy()
    telnetConnections.delete(connId)
  } else {
    console.warn('not find connId:', connId)
  }
  return { success: true }
})

// 窗口控制IPC
ipcMain.handle('minimize-window', () => {
  mainWindow.minimize()
})

ipcMain.handle('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
})

ipcMain.handle('close-window', () => {
  mainWindow.close()
})

ipcMain.handle('get-window-state', () => {
  return mainWindow.isMaximized()
})
