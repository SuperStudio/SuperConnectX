import { app, BrowserWindow, screen } from 'electron'
import os from 'os'
import path from 'path'
import logger from '../ipc/IpcAppLogger'
import packageJson from '../../../package.json'

/**
 * 格式化字节数（如 1024 → 1KB）
 */
const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

/**
 * 获取并打印应用所有有用信息（主进程）
 * @param mainWindow 主窗口实例（可选，用于打印窗口信息）
 */
export const printAppInfo = (mainWindow?: BrowserWindow) => {
  // ========== 1. 应用基础信息 ==========
  const appBasicInfo = {
    appName: app.getName(),
    appVersion: app.getVersion(),
    packageVersion: packageJson.version,
    vueVersion: packageJson.dependencies?.vue?.replace(/^\^|~/, ''),
    electronVersion: process.versions?.electron,
    nodeVersion: process.versions?.node,
    chromeVersion: process.versions?.chrome,
    env: process.env?.NODE_ENV || 'production',
    isPackaged: app.isPackaged, // 是否为打包后的应用（true=生产，false=开发）
    startupTime: new Date().toLocaleString() // 应用启动时间
  }

  // ========== 2. 系统环境信息 ==========
  const systemInfo = {
    osType: os.type(), // 系统类型（Windows_NT/Linux/Darwin）
    osRelease: os.release(), // 系统版本（如 10.0.19045）
    osPlatform: os.platform(), // 系统平台（win32/linux/darwin）
    arch: os.arch(), // CPU 架构（x64/arm64）
    cpuCores: os.cpus().length, // CPU 核心数
    totalMemory: formatBytes(os.totalmem()), // 总内存
    freeMemory: formatBytes(os.freemem()), // 可用内存
    username: os.userInfo().username, // 当前系统用户
    userDir: os.homedir(), // 用户主目录
    appDataDir: app.getPath('userData'), // 应用数据目录
    logDir: path.join(app.getPath('userData'), 'logs'), // 日志目录
    tempDir: app.getPath('temp') // 临时文件目录
  }

  // ========== 3. 屏幕信息 ==========
  const screenInfo = {
    primaryDisplaySize: `${screen.getPrimaryDisplay()?.size?.width}x${screen.getPrimaryDisplay()?.size?.height}`,
    primaryDisplayScale: screen.getPrimaryDisplay()?.scaleFactor // 屏幕缩放比例（如 1.5）
  }

  // ========== 4. 窗口信息（如果传入主窗口） ==========
  let windowInfo = {}
  if (mainWindow) {
    windowInfo = {
      windowId: mainWindow.id,
      windowBounds: mainWindow.getBounds(), // 窗口位置和尺寸
      isFullScreen: mainWindow.isFullScreen(),
      isMaximized: mainWindow.isMaximized(),
      isMinimized: mainWindow.isMinimized(),
      webContentsId: mainWindow.webContents?.id,
      pageTitle: mainWindow.getTitle(),
      url: mainWindow.webContents.getURL(),
      isLoading: mainWindow.webContents?.isLoading() // 页面是否正在加载
    }
  }

  // ========== 5. 性能信息（主进程内存使用） ==========
  const mainProcessMemory = process.memoryUsage()
  const performanceInfo = {
    mainProcessMemory: {
      rss: formatBytes(mainProcessMemory.rss), // 驻留集大小（进程占用的物理内存）
      heapTotal: formatBytes(mainProcessMemory.heapTotal), // 堆总大小
      heapUsed: formatBytes(mainProcessMemory.heapUsed), // 堆已使用
      external: formatBytes(mainProcessMemory.external) // 外部资源内存（如 C++ 对象）
    },
    cpuUsage: os.loadavg() // CPU 负载（Linux/macOS 有效，Windows 需额外处理）
  }

  // ========== 6. 配置信息（自定义，如接口地址） ==========
  const configInfo = {
    apiBaseUrl: process.env?.VITE_API_BASE_URL,
    featureSwitch: {
      autoUpdate: true,
      logUpload: false
    }
  }

  logger.info(
    JSON.stringify(
      {
        appBasicInfo,
        systemInfo,
        screenInfo,
        ...(mainWindow ? { windowInfo } : {}),
        performanceInfo,
        configInfo
      },
      null,
      2
    )
  )
}
