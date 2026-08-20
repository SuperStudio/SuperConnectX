import { BrowserWindow, app, ipcMain } from 'electron'
import path from 'path'
import { randomBytes, randomUUID } from 'crypto'
import AiBridgePolicy from './extensions/ai-control-bridge/services/AiBridgePolicy'
import ProtocolLogger from './utils/ProtocolLogger'
import IpcStorage from './ipc/IpcStorage'
import IpcConnector from './ipc/IpcConnector'
import IpcWindow from './ipc/IpcWindow'
import IpcTools from './ipc/IpcTools'
import IpcSerialPort from './ipc/IpcSerialPort'
import IpcVirtualPort from './ipc/IpcVirtualPort'
import IpcMain from './ipc/IpcMain'
import IpcDataCheck from './ipc/IpcDataCheck'
import AiBridgeServer from './extensions/ai-control-bridge/transport/AiBridgeServer'
import AiBridgeActivityLog from './extensions/ai-control-bridge/services/AiBridgeActivityLog'
import AiBridgeLogReader from './extensions/ai-control-bridge/services/AiBridgeLogReader'
import { InstanceInfo } from './extensions/ai-control-bridge/types/AiBridgeTypes'
import logger from './ipc/IpcAppLogger'
import { migrateDataIfNeeded, initAppPaths, cleanupChromiumClutter, getInstanceIndex, getAppDataDir } from './utils/AppDir'

// 禁用 Chromium 自动网络请求，避免公司内网代理环境触发安全告警
// Chromium 启动时会连接 Google 服务（组件更新、网络检测等），在代理环境下可能被拦截
app.commandLine.appendSwitch('disable-component-update')         // 禁用组件更新
app.commandLine.appendSwitch('disable-features', 'InterestFeedContentSuggestions')  // 禁用内容建议
app.commandLine.appendSwitch('disable-background-networking')   // 禁用后台网络（仅 Chromium 内核有效）

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
const getAiActivityLogOptions = (): {
  directory: string
  maxFileBytes: number
  maxFiles: number
} => {
  const settings = ipcStorage.getConfigService().get('settings').value || {}
  const configuredRoot =
    typeof settings.aiActivityLogPath === 'string' ? settings.aiActivityLogPath.trim() : ''
  const logRoot = configuredRoot || path.join(getAppDataDir(), 'app-logs')
  const maxSizeMb =
    typeof settings.aiActivityLogMaxSizeMb === 'number' ? settings.aiActivityLogMaxSizeMb : 10
  const maxFiles =
    typeof settings.aiActivityLogMaxFiles === 'number' ? settings.aiActivityLogMaxFiles : 5
  return {
    // AI 审计日志始终进入专属子目录，避免与软件运行日志或用户目录中的其他文件混放。
    directory: path.join(logRoot, 'ai-activity'),
    maxFileBytes: Math.max(1, Math.min(100, Math.trunc(maxSizeMb))) * 1024 * 1024,
    maxFiles: Math.max(1, Math.min(10, Math.trunc(maxFiles)))
  }
}
const aiActivityLog = new AiBridgeActivityLog(
  {
    error: (message, meta) => logger.error(message, meta),
    warn: (message, meta) => logger.warn(message, meta)
  },
  getAiActivityLogOptions()
)
runtimeEventHub.subscribe((event) => aiActivityLog.record(event))
ipcMain.handle('ai-activity:get-history', (_, limit?: number) => aiActivityLog.readHistory(limit))
ipcMain.handle('ai-activity:get-log-info', () => aiActivityLog.getInfo())
ipcMain.handle('ai-activity:open-log-directory', () => aiActivityLog.openDirectory())
const bridgeAccessPolicy = new AiBridgePolicy(ipcStorage.getConfigService())
const bridgeTransportSupported = process.platform === 'win32'
runtimeEventHub.setRxRetentionGate(
  () => bridgeTransportSupported && bridgeAccessPolicy.getState().enabled
)
runtimeEventHub.subscribe((event) => {
  if (event.eventType === 'config.changed' && event.payload.domain === 'settings') {
    aiActivityLog.configure(getAiActivityLogOptions())
    if (!bridgeAccessPolicy.getState().enabled) runtimeEventHub.clearRetainedRx()
  }
})
ipcConnector.init(protocolLogger, windows)
IpcWindow.getInstance().init(windows)
IpcTools.getInstance().init(windows)
IpcSerialPort.getInstance().init(protocolLogger, windows)
IpcVirtualPort.getInstance().init(protocolLogger, windows)
IpcMain.getInstance().init(protocolLogger, windows)
IpcDataCheck.getInstance().init()

// GUI 作为 shared event 的一个 adapter；AiBridgeServer 订阅同一个 RuntimeEventHub。
// 配置变化和 AI TX 都必须回到 GUI；RX 继续沿用现有 on-recv-data 路径，避免重复渲染。
runtimeEventHub.subscribe((event) => {
  const webContents = windows.mainWindow?.webContents
  if (!webContents || webContents.isDestroyed()) return
  const isConfigEvent =
    event.eventType === 'config.changed' || event.eventType === 'session.config.changed'
  const isTxEvent = event.eventType === 'tx.accepted' || event.eventType === 'tx.failed'
  const isAiActivity = event.eventType === 'ai.activity'
  const isAiClientEvent = event.eventType === 'ai.client.changed'
  const isSessionEvent = event.eventType === 'session.state' || event.eventType === 'session.closed'
  if (isConfigEvent || isTxEvent || isAiActivity || isAiClientEvent || isSessionEvent) {
    webContents.send('on-bridge-event', event)
  }
})

const bridgeInstance: InstanceInfo = {
  instanceId: randomUUID(),
  pid: process.pid,
  instanceIndex: instanceIdx,
  appVersion: app.getVersion(),
  endpoint: ''
}
const bridgePipeName = `\\\\.\\pipe\\superconnectx-${process.pid}-${bridgeInstance.instanceId}`
bridgeInstance.endpoint = bridgePipeName
// 主实例保留稳定发现文件；显式启动的附加实例使用独立文件，避免退出时互相删除。
const bridgeEndpointFile = path.join(
  getAppDataDir(),
  'bridge',
  instanceIdx === 0 ? 'endpoint.json' : `endpoint-${instanceIdx}.json`
)
const bridgeServer = new AiBridgeServer(
  {
    instance: bridgeInstance,
    connections: ipcConnector.getConnectionService(),
    config: ipcStorage.getConfigService(),
    events: runtimeEventHub,
    access: bridgeAccessPolicy,
    lifecycle: {
      startByConnectionId: (id, sessionId, extraFields) =>
        ipcConnector.startConnectionByIdForBridge(id, sessionId, extraFields),
      startByPort: (portPath, sessionId, extraFields) =>
        ipcConnector.startPortSessionForBridge(portPath, sessionId, extraFields),
      stop: (sessionId) => ipcConnector.stopConnectionForBridge(sessionId)
    },
    catalog: ipcStorage.getCoreCatalog(),
    serialPorts: {
      list: () => IpcSerialPort.getInstance().listSerialPorts(false)
    },
    logs: new AiBridgeLogReader({
      getLogFilePath: (sessionId) => protocolLogger.getLogFilePath(sessionId)
    })
  },
  {
    pipeName: bridgePipeName,
    token: process.env.SCX_BRIDGE_TOKEN || randomBytes(32).toString('hex'),
    endpointFile: bridgeEndpointFile,
    logger: {
      info: (message) => logger.info(message),
      warn: (message) => logger.warn(message),
      error: (message) => logger.error(message)
    }
  }
)
ipcMain.handle('ai-bridge:get-client-status', () => bridgeServer.getClientStatus())

// AI 修改已保存的 COM 参数时，尝试把同一 patch 应用到当前运行会话。
ipcStorage.getConfigService().addApplyHandler(async ({ domain, targetId, patch, source }) => {
  if (domain !== 'com-settings' || source === 'gui' || !targetId) return
  const session = ipcConnector.getConnectionService().findSessionByComName(targetId)
  if (!session)
    return {
      effectiveNow: false,
      requiresReconnect: true,
      message: 'No active session for this COM port'
    }

  const runtimeKeys = [
    'baudRate',
    'dataBits',
    'stopBits',
    'parity',
    'encoding',
    'readTimeout',
    'writeTimeout',
    'flowControl',
    'rts',
    'dtr'
  ]
  const runtimePatch = Object.fromEntries(
    Object.entries(patch).filter(([key]) => runtimeKeys.includes(key))
  ) as Record<string, unknown>
  if (patch.hexDisplayMode !== undefined) runtimePatch.receiveHex = patch.hexDisplayMode
  if (patch.showTimestamp !== undefined) runtimePatch.logTimestamp = patch.showTimestamp
  if (Object.keys(runtimePatch).length === 0) return { effectiveNow: true }
  const result = await ipcConnector.applyRuntimeConfigForBridge(session.sessionId, runtimePatch)
  const typedResult = result as { success?: boolean; message?: string }
  return {
    effectiveNow: typedResult.success !== false,
    requiresReconnect: typedResult.success === false,
    message: typedResult.message
  }
})

if (bridgeTransportSupported && process.env.SCX_BRIDGE_DISABLED !== '1') {
  bridgeServer.start().catch((error) => {
    logger.warn(
      `AI bridge disabled after listen failure: ${error instanceof Error ? error.message : String(error)}`
    )
  })
} else if (!bridgeTransportSupported) {
  logger.info(`AI bridge transport is not available on ${process.platform}`)
}
app.on('before-quit', () => {
  void bridgeServer.stop()
})

// 自动更新模块默认不加载，仅在用户点击"检查更新"并确认后才动态加载
// electron-updater 在被 import 时就会做网络操作，提前加载会在公司内网代理环境触发告警

// 清理 Chromium 在 userData 根目录下残留的杂散目录
app.whenReady().then(() => {
  cleanupChromiumClutter(logger)
})

logger.info(`======== start superconnect-x ok (instance ${instanceIdx}) ========`)
