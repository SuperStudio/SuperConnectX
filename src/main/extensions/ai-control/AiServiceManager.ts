import path from 'path'
import type { BrowserWindow } from 'electron'
import type ConfigService from '../../services/ConfigService'
import type { CoreCatalog } from '../../services/types/CoreCatalog'
import type IpcConnector from '../../ipc/IpcConnector'
import type { AiConfigDocument } from '../../../shared/extensions/ai-control/AiConfigTypes'
import { getAppDataDir } from '../../utils/AppDir'
import AiOperationRegistry from './application/AiOperationRegistry'
import PolicyService from './application/PolicyService'
import RuntimeAuthorizationService from './application/RuntimeAuthorizationService'
import SessionLeaseService from './application/SessionLeaseService'
import AiEventBuffer from './application/AiEventBuffer'
import { createServerHandlers } from './application/handlers/ServerHandlers'
import { createSerialHandlers } from './application/handlers/SerialHandlers'
import { createSessionHandlers } from './application/handlers/SessionHandlers'
import { createLogHandlers } from './application/handlers/LogHandlers'
import { createConnectionHandlers } from './application/handlers/ConnectionHandlers'
import { createCommandHandlers } from './application/handlers/CommandHandlers'
import { createConfigHandlers } from './application/handlers/ConfigHandlers'
import { createActivityHandlers } from './application/handlers/ActivityHandlers'
import SuperConnectXSessionAdapter from './adapters/host/SuperConnectXSessionAdapter'
import SuperConnectXConfigAdapter from './adapters/host/SuperConnectXConfigAdapter'
import SuperConnectXEventAdapter from './adapters/host/SuperConnectXEventAdapter'
import SuperConnectXSerialAdapter from './adapters/host/SuperConnectXSerialAdapter'
import AiConfigStorage from './infrastructure/AiConfigStorage'
import AiConfigService from './infrastructure/AiConfigService'
import AiActivityLog, { type AiActivityLogOptions } from './infrastructure/AiActivityLog'
import AiActivityService from './infrastructure/AiActivityService'
import AiLogReader from './infrastructure/AiLogReader'
import McpAdapter from './adapters/mcp/McpAdapter'
import McpServerManager from './adapters/mcp/McpServerManager'
import IpcAiService from './ipc/IpcAiService'

interface AiServiceManagerOptions {
  windows: { mainWindow?: BrowserWindow | null }
  connector: IpcConnector
  configService: ConfigService
  catalog: CoreCatalog
  listSerialPorts: () => Promise<unknown[]>
  getLogFilePath: (
    sessionId: string
  ) => Promise<{ success: boolean; filePath?: string; message?: string }>
  logger: {
    info: (message: string) => void
    warn: (message: string, meta?: unknown) => void
    error: (message: string, meta?: unknown) => void
  }
  instanceIndex: number
  appVersion: string
  legacySettings?: Record<string, unknown>
  clearLegacySettings?: () => void
}

export default class AiServiceManager {
  private configStorage?: AiConfigStorage
  private activity?: AiActivityService
  private mcp?: McpServerManager
  private ipc?: IpcAiService
  private eventBuffer?: AiEventBuffer
  private releaseConfig?: () => void
  private releaseSession?: () => void
  private previousConfig?: AiConfigDocument

  constructor(private readonly options: AiServiceManagerOptions) {}

  async start(): Promise<void> {
    const { connector, configService, instanceIndex } = this.options
    const storage = new AiConfigStorage(path.join(getAppDataDir(), 'userdata', 'ai-bridge.json'))
    await storage.init(this.options.legacySettings)
    this.options.clearLegacySettings?.()
    await storage.ensureInstance(instanceIndex)
    const config = new AiConfigService(storage, instanceIndex)
    const authorization = new RuntimeAuthorizationService()
    const policy = new PolicyService(config, authorization)
    const leases = new SessionLeaseService()
    const eventBuffer = new AiEventBuffer()
    const mcpRef: { current?: McpServerManager } = {}
    const eventHub = connector.getRuntimeEventHub()
    eventHub.setRxSink((event) => eventBuffer.enqueueRx(event))
    eventHub.setRxRetentionGate(() => {
      const value = config.get()
      return (
        config.getInstance().enabled &&
        value.shared.capabilityGroups.sessionRead &&
        (mcpRef.current?.getStatus().clientCount || 0) > 0
      )
    })

    const activityLog = new AiActivityLog(
      { error: this.options.logger.error, warn: this.options.logger.warn },
      this.activityOptions(config.get())
    )
    const activity = new AiActivityService(
      eventHub,
      activityLog,
      () => config.get().shared.activity.commandContentMode
    )
    activity.start()

    const sessions = new SuperConnectXSessionAdapter(connector, configService)
    const businessConfig = new SuperConnectXConfigAdapter(configService)
    const events = new SuperConnectXEventAdapter(
      eventHub,
      eventBuffer,
      () => config.get().shared.activity.commandContentMode
    )
    const serial = new SuperConnectXSerialAdapter(this.options.listSerialPorts)
    const logs = new AiLogReader({ getLogFilePath: this.options.getLogFilePath })
    const leasesService = leases
    const scheduler = connector.getCommandScheduler()
    configService.addApplyHandler(async ({ domain, targetId, patch, source }) => {
      if (domain !== 'com-settings' || source === 'gui' || !targetId) return
      const session = connector.getConnectionService().findSessionByPortPath(targetId)
      if (!session)
        return {
          effectiveNow: false,
          requiresReconnect: true,
          message: 'No active session for this serial port'
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
      const result = (await connector.applyRuntimeConfigForAi(session.sessionId, runtimePatch)) as {
        success?: boolean
        message?: string
      }
      return {
        effectiveNow: result.success !== false,
        requiresReconnect: result.success === false,
        message: result.message
      }
    })
    const registry = new AiOperationRegistry([
      ...createServerHandlers(() => ({
        instanceId: instanceIndex + 1,
        appVersion: this.options.appVersion,
        service: mcpRef.current?.getStatus(),
        latestSequence: events.latestSequence()
      })),
      ...createSerialHandlers(serial),
      ...createSessionHandlers({
        sessions,
        settings: sessions,
        events,
        serial,
        leases: leasesService,
        scheduler,
        canCloseUserOpenedConnection: () => config.get().shared.allowAiCloseUserConnection
      }),
      ...createLogHandlers(logs),
      ...createConnectionHandlers(this.options.catalog, businessConfig),
      ...createCommandHandlers(this.options.catalog, businessConfig),
      ...createConfigHandlers(businessConfig),
      ...createActivityHandlers(activity)
    ])
    const adapter = new McpAdapter(
      registry,
      policy,
      activity,
      this.options.appVersion,
      this.options.logger
    )
    const mcp = new McpServerManager(
      instanceIndex,
      config,
      adapter,
      leases,
      authorization,
      activity
    )
    mcpRef.current = mcp
    const ipc = new IpcAiService(this.options.windows, config, mcp, activity)
    ipc.init()

    this.configStorage = storage
    this.activity = activity
    this.mcp = mcp
    this.ipc = ipc
    this.eventBuffer = eventBuffer
    this.previousConfig = config.get()
    this.releaseSession = connector.getConnectionService().onSessionClosed((lifecycle) => {
      leases.releaseSession(lifecycle.sessionId)
      scheduler.cancelSession(lifecycle.sessionId)
      eventBuffer.clearSession(lifecycle.sessionId)
    })
    this.releaseConfig = config.onChanged((next) => void this.onConfigChanged(next))
    await mcp.start()
    this.options.logger.info('[AiServiceManager] initialized')
  }

  getMcpServerManager(): McpServerManager | undefined {
    return this.mcp
  }

  async dispose(): Promise<void> {
    this.releaseConfig?.()
    this.releaseSession?.()
    this.ipc?.dispose()
    await this.mcp?.dispose()
    await this.activity?.dispose()
    this.options.connector.getRuntimeEventHub().setRxSink(undefined)
    this.eventBuffer?.dispose()
    this.configStorage?.dispose()
  }

  private async onConfigChanged(next: AiConfigDocument): Promise<void> {
    const previous = this.previousConfig
    this.previousConfig = next
    this.activity?.configure(this.activityOptions(next))
    const key = String(this.options.instanceIndex)
    if (previous?.instances[key]?.token !== next.instances[key]?.token)
      await this.mcp?.invalidateSessions()
    await this.mcp?.reconcile()
  }

  private activityOptions(config: AiConfigDocument): AiActivityLogOptions {
    const activity = config.shared.activity
    const root = activity.logRoot.trim() || path.join(getAppDataDir(), 'app-logs')
    return {
      directory: path.join(root, 'ai-activity'),
      maxFileBytes: activity.logMaxSizeMb * 1024 * 1024,
      maxFiles: activity.logMaxFiles
    }
  }
}
