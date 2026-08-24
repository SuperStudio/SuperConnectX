import { BrowserWindow, app } from 'electron'
import ProtocolLogger from './utils/ProtocolLogger'
import IpcStorage from './ipc/IpcStorage'
import IpcConnector from './ipc/IpcConnector'
import IpcWindow from './ipc/IpcWindow'
import IpcTools from './ipc/IpcTools'
import IpcSerialPort from './ipc/IpcSerialPort'
import IpcVirtualPort from './ipc/IpcVirtualPort'
import IpcMain from './ipc/IpcMain'
import IpcDataCheck from './ipc/IpcDataCheck'
import AiServiceManager from './extensions/ai-control/AiServiceManager'
import InstanceCoordinator from './services/InstanceCoordinator'
import logger from './ipc/IpcAppLogger'
import {
  migrateDataIfNeeded,
  initAppPaths,
  cleanupChromiumClutter,
  getInstanceIndex
} from './utils/AppDir'

// 禁用 Chromium 自动网络请求，避免公司内网代理环境触发安全告警
// Chromium 启动时会连接 Google 服务（组件更新、网络检测等），在代理环境下可能被拦截
app.commandLine.appendSwitch('disable-component-update') // 禁用组件更新
app.commandLine.appendSwitch('disable-features', 'InterestFeedContentSuggestions') // 禁用内容建议
app.commandLine.appendSwitch('disable-background-networking') // 禁用后台网络（仅 Chromium 内核有效）

const instanceCoordination = InstanceCoordinator.bootstrap()
if (instanceCoordination.shouldExit) {
  app.exit(0)
  process.exit(0)
}

// 必须在 app.whenReady() 之前调用，将 Electron 内置路径（Cache、CrashDumps 等）
// 重定向到 userData 子目录，避免根目录散乱
initAppPaths()

const instanceIdx = getInstanceIndex()

const protocolLogger = new ProtocolLogger()
const windows = { mainWindow: undefined as BrowserWindow | undefined }

logger.info(`======== start superconnect-x (instance ${instanceIdx}) ========`)
logger.info(JSON.stringify(IpcMain.getInstance().getVersionInfo()))

// 迁移旧数据：如果 EXE 目录下存在旧的 userdata/backup，拷贝到 appDataDir 并删除旧目录
migrateDataIfNeeded(logger)

const ipcConnector = IpcConnector.getInstance()
const runtimeEventHub = ipcConnector.getRuntimeEventHub()
const ipcStorage = IpcStorage.getInstance()
ipcStorage.init(runtimeEventHub)
ipcConnector.init(protocolLogger, windows)
IpcWindow.getInstance().init(windows)
IpcTools.getInstance().init(windows)
IpcSerialPort.getInstance().init(protocolLogger, windows)
IpcVirtualPort.getInstance().init(protocolLogger, windows)
IpcDataCheck.getInstance().init()

// 低频运行事件同步给 Renderer；RX 继续使用原有 on-recv-data 热路径。
runtimeEventHub.subscribe((event) => {
  const webContents = windows.mainWindow?.webContents
  if (!webContents || webContents.isDestroyed()) return
  if (event.eventType !== 'rx.display') webContents.send('on-runtime-event', event)
})

const aiServiceManager = new AiServiceManager({
  windows,
  connector: ipcConnector,
  configService: ipcStorage.getConfigService(),
  catalog: ipcStorage.getCoreCatalog(),
  listSerialPorts: () => IpcSerialPort.getInstance().listSerialPorts(false),
  getLogFilePath: (sessionId) => protocolLogger.getLogFilePath(sessionId),
  logger: {
    info: (message) => logger.info(message),
    warn: (message, meta) => logger.warn(message, meta),
    error: (message, meta) => logger.error(message, meta)
  },
  instanceIndex: instanceIdx,
  appVersion: app.getVersion(),
  legacySettings: ipcStorage.getConfigService().get('settings').value || undefined,
  clearLegacySettings: () => ipcStorage.removeLegacyAiSettings()
})

const aiServiceReady = aiServiceManager.start().catch((error) => {
  logger.error(
    `[AiServiceManager] startup failed: ${error instanceof Error ? error.message : String(error)}`
  )
  throw error
})

// AI 页面加载后会立即读取状态和配置；窗口必须在 AI IPC 注册完成后创建。
IpcMain.getInstance().init(protocolLogger, windows, aiServiceReady)

app.on('before-quit', () => {
  void aiServiceManager.dispose()
  instanceCoordination.coordinator?.dispose()
})

// 自动更新模块默认不加载，仅在用户点击"检查更新"并确认后才动态加载
// electron-updater 在被 import 时就会做网络操作，提前加载会在公司内网代理环境触发告警

// 清理 Chromium 在 userData 根目录下残留的杂散目录
app.whenReady().then(() => {
  cleanupChromiumClutter(logger)
})

logger.info(`======== start superconnect-x ok (instance ${instanceIdx}) ========`)
