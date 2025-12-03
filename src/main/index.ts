import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store' // v3 版本在这里可以正常访问 app 模块
import { Telnet } from 'telnet-client' // 导入telnet客户端
import logger from './utils/logger' // 导入文件系统模块

const _logger = new logger(app.getPath('userData'))

// 新增：IPC 监听「打开日志」请求
ipcMain.handle('open-telnet-log', async () => {
  return await _logger.openLogDir()
})

let mainWindow: BrowserWindow

// 存储活跃的Telnet连接
const telnetConnections = new Map<number, Telnet>()

function createWindow(): void {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
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
      const dataStr = `[${new Date().toISOString()}] ${data}`
      _logger.writeToLog(dataStr)
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
      const dataStr = `[${new Date().toISOString()}] SEND >>>>>>>>>> ${command}`
      _logger.writeToLog(dataStr)
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

// 初始化命令预设存储
const presetCommandsStore = new Store({
  name: 'presetCommands',
  cwd: 'super-ssh',
  defaults: {
    commands: []
  }
})

// 命令预设相关IPC处理
ipcMain.handle('get-preset-commands', () => {
  return presetCommandsStore.get('commands')
})
// 修复：添加命令时使用结构化克隆
ipcMain.handle('add-preset-command', (_, cmd: any) => {
  try {
    // 关键：使用 JSON 序列化/反序列化创建纯对象，去除响应式元数据
    const pureCmd = JSON.parse(JSON.stringify(cmd))
    const commands = presetCommandsStore.get('commands', []) as any[]

    // 确保 id 生成逻辑安全
    const newId = commands.length ? Math.max(...commands.map((c) => Number(c.id) || 0)) + 1 : 1

    const newCmd = {
      id: newId,
      name: pureCmd.name || '',
      command: pureCmd.command || '',
      delay: Number(pureCmd.delay) || 0 // 确保是数字类型
    }

    commands.push(newCmd)
    presetCommandsStore.set('commands', commands)
    return newCmd
  } catch (error) {
    console.error('添加预设命令失败:', error)
    throw new Error('添加命令失败：' + (error as Error).message)
  }
})

// 修复：更新命令时同样处理
ipcMain.handle('update-preset-command', (_, cmd: any) => {
  try {
    const pureCmd = JSON.parse(JSON.stringify(cmd))
    const commands = presetCommandsStore.get('commands', []) as any[]
    const index = commands.findIndex((c) => c.id === Number(pureCmd.id))

    if (index !== -1) {
      commands[index] = {
        id: Number(pureCmd.id),
        name: pureCmd.name || '',
        command: pureCmd.command || '',
        delay: Number(pureCmd.delay) || 0
      }
      presetCommandsStore.set('commands', commands)
      return commands[index]
    }
    throw new Error('未找到该命令')
  } catch (error) {
    console.error('更新预设命令失败:', error)
    throw new Error('更新命令失败：' + (error as Error).message)
  }
})

ipcMain.handle('delete-preset-command', (_, id: number) => {
  const commands = presetCommandsStore.get('commands') as any[]
  const newCommands = commands.filter((c) => c.id !== id)
  presetCommandsStore.set('commands', newCommands as never[])
  return newCommands
})
