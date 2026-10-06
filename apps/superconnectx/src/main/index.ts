import { BrowserWindow, app, ipcMain } from 'electron'
import { join } from 'node:path'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { CallbackAuditSink } from '@superconnectx/mcp/audit'
import ProtocolLogger from './utils/ProtocolLogger'
import IpcStorage from './ipc/IpcStorage'
import IpcConnector from './ipc/IpcConnector'
import IpcWindow from './ipc/IpcWindow'
import IpcTools from './ipc/IpcTools'
import IpcSerialPort from './ipc/IpcSerialPort'
import IpcVirtualPort from './ipc/IpcVirtualPort'
import IpcMain from './ipc/IpcMain'
import IpcDataCheck from './ipc/IpcDataCheck'
import logger from './ipc/IpcAppLogger'
import { migrateDataIfNeeded, initAppPaths, cleanupChromiumClutter, getInstanceIndex } from './utils/AppDir'
import McpHttpServer from './mcp/McpHttpServer'
import SuperConnectXMcpFacade from './mcp/SuperConnectXMcpFacade'
import { McpTemplateRegistry } from './mcp/McpTemplateRegistry'
import { getSkillInstallCommands, getSkillInstallTargets, installBundledMcpSkill } from './mcp/McpSkillInstaller'
import SettingsStorage from './storage/SettingsStorage'
import { DEFAULT_MCP_PERMISSION_POLICY, type McpPermissionPolicy } from '../shared/mcp/McpTypes'
import { expandDirectoryComponents, loadDeveloperProfile } from '@superconnectx/mcp/developer-profile'

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
let mcpHttpServer: McpHttpServer | null = null
let mcpComponents: Awaited<ReturnType<typeof expandDirectoryComponents>> | undefined
const mcpTemplateRegistry = new McpTemplateRegistry()
const settingsStorage = new SettingsStorage()
const mcpFacade = new SuperConnectXMcpFacade(mcpTemplateRegistry)
const mcpAudit = new CallbackAuditSink((event) => {
  logger.info(
    `[MCP][audit] tool=${event.tool} result=${event.result} session=${event.sessionId ?? '-'} owner=${event.ownerId ?? '-'} summary=${event.summary ?? '-'} requestId=${event.requestId}${event.code ? ` code=${event.code}` : ''}`
  )
})
const getMcpPolicy = (): McpPermissionPolicy => {
  const settings = settingsStorage.getSettings()
  const mode = settings.mcpAccessMode ?? 'read-only'
  return {
    ...DEFAULT_MCP_PERMISSION_POLICY,
    write: mode === 'read-write' || mode === 'full',
    destructive: mode === 'full',
    export: Boolean(settings.mcpAllowExport) && mode === 'full'
  }
}
const startMcpRuntime = async (): Promise<boolean> => {
  const settings = settingsStorage.getSettings()
  if (!settings.mcpEnabled) return false
  if (!mcpHttpServer) mcpHttpServer = new McpHttpServer(mcpFacade, process.env.SCX_MCP_TOKEN, getMcpPolicy(), mcpAudit, mcpComponents)
  if (mcpHttpServer.status.enabled) return true
  await mcpHttpServer.start(Number(settings.mcpPort ?? 32180))
  logger.info(`[MCP] enabled at ${mcpHttpServer.endpoint}`)
  return true
}
const stopMcpRuntime = async (): Promise<boolean> => {
  if (!mcpHttpServer) return true
  await mcpHttpServer.close()
  return true
}
ipcMain.handle('mcp:get-status', () => mcpHttpServer?.status ?? { enabled: false, port: null, endpoint: null })
ipcMain.handle('mcp:get-client-config', () => mcpHttpServer?.getClientConfig() ?? { endpoint: null, token: null })
ipcMain.handle('mcp:rotate-token', () => mcpHttpServer?.rotateToken() ?? null)
ipcMain.handle('mcp:get-settings', () => {
  const settings = settingsStorage.getSettings()
  return {
    enabled: Boolean(settings.mcpEnabled),
    port: Number(settings.mcpPort ?? 32180),
    accessMode: settings.mcpAccessMode ?? 'read-only',
    allowExport: Boolean(settings.mcpAllowExport)
  }
})
ipcMain.handle('mcp:save-settings', async (_, input) => {
  const value = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const port = Number(value.port)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('端口必须在 1024-65535 之间')
  const accessMode = value.accessMode === 'read-write' || value.accessMode === 'full' ? value.accessMode : 'read-only'
  const enabled = value.enabled === true
  settingsStorage.saveSettings({
    mcpEnabled: enabled,
    mcpPort: port,
    mcpAccessMode: accessMode,
    mcpAllowExport: value.allowExport === true
  })
  const wasRunning = Boolean(mcpHttpServer?.status.enabled)
  const oldPort = mcpHttpServer?.status.port
  if (mcpHttpServer) mcpHttpServer.setPermissionPolicy(getMcpPolicy())
  if (wasRunning && oldPort !== port) await stopMcpRuntime()
  if (enabled) await startMcpRuntime()
  else await stopMcpRuntime()
  return true
})
ipcMain.handle('mcp:start', async () => {
  settingsStorage.saveSettings({ mcpEnabled: true })
  return startMcpRuntime()
})
ipcMain.handle('mcp:stop', async () => {
  settingsStorage.saveSettings({ mcpEnabled: false })
  return stopMcpRuntime()
})
ipcMain.handle('mcp:import-template', async (_, filePath: string) => {
  if (typeof filePath !== 'string' || !filePath.toLowerCase().endsWith('.json')) throw new Error('模板必须是 JSON 文件')
  const parsed = JSON.parse(await readFile(filePath, 'utf8'))
  const template = mcpTemplateRegistry.register(parsed)
  const targetDir = join(app.getPath('userData'), 'mcp', 'templates')
  await mkdir(targetDir, { recursive: true })
  await copyFile(filePath, join(targetDir, `${template.id}.json`))
  return { id: template.id, version: template.version, name: template.name }
})
ipcMain.handle('mcp:install-skill', async () => installBundledMcpSkill())
ipcMain.handle('mcp:get-skill-install-info', () => ({
  targets: getSkillInstallTargets(),
  commands: getSkillInstallCommands()
}))

logger.info(`======== start superconnect-x (instance ${instanceIdx}) ========`)
logger.info(JSON.stringify(IpcMain.getInstance().getVersionInfo()))

// 迁移旧数据：如果 EXE 目录下存在旧的 userdata/backup，拷贝到 appDataDir 并删除旧目录
migrateDataIfNeeded(logger)

IpcStorage.getInstance().init()
IpcConnector.getInstance().init(protocolLogger, windows)
IpcWindow.getInstance().init(windows)
IpcTools.getInstance().init(windows)
IpcSerialPort.getInstance().init(protocolLogger, windows)
IpcVirtualPort.getInstance().init(protocolLogger, windows)
IpcMain.getInstance().init(protocolLogger, windows)
IpcDataCheck.getInstance().init()

// 自动更新模块默认不加载，仅在用户点击"检查更新"并确认后才动态加载
// electron-updater 在被 import 时就会做网络操作，提前加载会在公司内网代理环境触发告警

// 清理 Chromium 在 userData 根目录下残留的杂散目录
app.whenReady().then(() => {
  cleanupChromiumClutter(logger)
})

app.whenReady().then(async () => {
  const profile = await loadDeveloperProfile(mcpTemplateRegistry)
  mcpComponents = await expandDirectoryComponents(profile?.components ?? [])
  if (profile) {
    logger.info(`[MCP] developer profile=${profile.profile.id} source=${profile.source} templates=${profile.loadedTemplates.length} components=${mcpComponents.length} skipped=${profile.skipped.length}`)
  }
  const templateDirectories = [
    join(process.resourcesPath, 'mcp', 'templates'),
    join(app.getAppPath(), 'resources', 'mcp', 'templates'),
    join(app.getPath('userData'), 'mcp', 'templates'),
    join(process.cwd(), '.superconnectx', 'templates')
  ]
  for (const directory of templateDirectories) {
    try {
      const result = await mcpTemplateRegistry.loadDirectory(directory)
      if (result.loaded.length || result.skipped.length) {
        logger.info(`[MCP] templates loaded=${result.loaded.length} skipped=${result.skipped.length} dir=${directory}`)
      }
    } catch (error) {
      logger.warn(`[MCP] template directory unavailable: ${directory} (${error instanceof Error ? error.message : error})`)
    }
  }
})

const mcpPortArgument = process.argv.find((argument) => argument.startsWith('--mcp-port='))?.split('=')[1]
const mcpPortValue = mcpPortArgument ?? process.env.SCX_MCP_PORT
if (mcpPortValue) {
  const mcpPort = Number.parseInt(mcpPortValue, 10)
  mcpHttpServer = new McpHttpServer(mcpFacade, process.env.SCX_MCP_TOKEN, getMcpPolicy(), mcpAudit, mcpComponents)
  app.whenReady().then(async () => {
    try {
      const info = await mcpHttpServer!.start(mcpPort)
      logger.info(`[MCP] enabled at ${info.endpoint}`)
    } catch (error) {
      logger.error(`[MCP] failed to start: ${error instanceof Error ? error.message : error}`)
      mcpHttpServer = null
    }
  })
}
app.whenReady().then(() => {
  if (!mcpPortValue) {
    void startMcpRuntime().catch((error) => logger.error(`[MCP] failed to start: ${error instanceof Error ? error.message : error}`))
  }
})

logger.info(`======== start superconnect-x ok (instance ${instanceIdx}) ========`)
