import crypto from 'crypto'
import fs from 'fs'
import net from 'net'
import path from 'path'
import AiBridgeHost from './AiBridgeHost'
import { RuntimeEventFilter, RuntimeEvent } from '../../../services/types/RuntimeTypes'
import { ConfigServiceError } from '../../../services/ConfigService'
import {
  AI_GUI_SAVED_CONNECTION_TYPES,
  getAiBridgeMethodAccess
} from '../../../../shared/extensions/ai-control-bridge/AiBridgeCapabilities'
import { prepareCommand } from '../../../../shared/serial/CommandPreparation'
import { checkData } from '../../../utils/DataCheckEngine'
import { AiBridgePolicyError } from '../services/AiBridgePolicy'
import { AiBridgeClientStatus } from '../../../../shared/extensions/ai-control-bridge/AiBridgeEvents'

const MAX_FRAME_BYTES = 1024 * 1024
const MAX_RESPONSE_BYTES = 1024 * 1024
const MAX_OUTBOUND_QUEUE_BYTES = 1024 * 1024

export interface AiBridgeServerOptions {
  pipeName: string
  token: string
  endpointFile?: string
  logger?: {
    info?: (message: string) => void
    warn?: (message: string) => void
    error?: (message: string) => void
  }
}

export class AiBridgeRpcError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly rpcCode: number = -32000,
    public readonly data?: unknown
  ) {
    super(message)
    this.name = 'AiBridgeRpcError'
  }
}

interface RpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

interface RpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface Attachment {
  mode: 'read' | 'write'
  releaseRxCapture: () => void
}

interface BridgeSubscription {
  unsubscribe: () => void
  releaseRxCapture?: () => void
}

interface OutboundFrame {
  value: string
  bytes: number
  droppable: boolean
  subscriptionId?: string
}

function asParams(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AiBridgeRpcError('INVALID_PARAMS', `${field} must be a non-empty string`, -32602)
  }
  return value
}

function normalizePortPath(value: unknown): string {
  if (typeof value === 'number') {
    if (process.platform === 'win32' && Number.isInteger(value) && value > 0) {
      return `COM${value}`
    }
    throw new AiBridgeRpcError('INVALID_PARAMS', 'portPath must be a serial port path', -32602)
  }

  if (typeof value !== 'string') {
    throw new AiBridgeRpcError('INVALID_PARAMS', 'portPath must be a serial port path', -32602)
  }

  const portPath = value.trim()
  if (portPath.length === 0) {
    throw new AiBridgeRpcError('INVALID_PARAMS', 'portPath must be a serial port path', -32602)
  }
  if (process.platform === 'win32' && /^\d+$/.test(portPath)) return `COM${portPath}`
  return portPath
}

function getListedPortPath(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const portPath = (value as { path?: unknown }).path
  return typeof portPath === 'string' && portPath.trim() ? portPath.trim() : undefined
}

function samePortPath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toUpperCase() === right.toUpperCase()
    : left === right
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function previewActivityText(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  return value.length > 120 ? `${value.slice(0, 117)}...` : value
}

function getActivityDetails(
  method: string,
  params: Record<string, unknown>
): Record<string, unknown> {
  const details: Record<string, unknown> = {}
  if (typeof params.sessionId === 'string') details.sessionId = params.sessionId
  if (typeof params.domain === 'string') details.domain = params.domain
  if (typeof params.connectionId === 'number') details.connectionId = params.connectionId
  if (typeof params.portPath === 'string' || typeof params.portPath === 'number') {
    if (method === 'start_port_session') {
      try {
        details.portPath = normalizePortPath(params.portPath)
      } catch {
        details.portPath = params.portPath
      }
    } else {
      details.portPath = params.portPath
    }
  }
  if (typeof params.groupId === 'number') details.groupId = params.groupId
  if (typeof params.commandId === 'number') details.commandId = params.commandId
  if (typeof params.mode === 'string') details.mode = params.mode

  if (method === 'send') {
    const command = previewActivityText(params.text)
    if (command) details.command = command
  }

  if (
    method === 'patch_config' &&
    params.patch &&
    typeof params.patch === 'object' &&
    !Array.isArray(params.patch)
  ) {
    details.fields = Object.keys(params.patch as Record<string, unknown>).join(', ')
  }

  for (const field of ['connection', 'group', 'command']) {
    const value = params[field]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const name = (value as Record<string, unknown>).name
      if (typeof name === 'string' && name.length > 0) details.name = previewActivityText(name)
    }
  }

  return details
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function makeFilter(
  params: Record<string, unknown>,
  sessionIds?: string[]
): RuntimeEventFilter | undefined {
  const eventTypes = Array.isArray(params.eventTypes)
    ? params.eventTypes.filter(
        (value): value is RuntimeEvent['eventType'] => typeof value === 'string'
      )
    : undefined
  return {
    eventTypes,
    sessionIds:
      sessionIds ||
      (Array.isArray(params.sessionIds)
        ? params.sessionIds.filter((value): value is string => typeof value === 'string')
        : undefined)
  }
}

/**
 * Windows Named Pipe 上的最小 JSON-RPC/NDJSON Bridge。
 * 协议层只依赖 AiBridgeHost，不直接 import Electron、serialport 或 Storage。
 */
export default class AiBridgeServer {
  private server: net.Server | null = null
  private readonly clients = new Set<AiBridgeClient>()
  private stopping = false
  private endpointWritten = false

  constructor(
    private readonly host: AiBridgeHost,
    private readonly options: AiBridgeServerOptions
  ) {}

  async start(): Promise<void> {
    if (this.server) return
    this.stopping = false
    const server = net.createServer((socket) => {
      const client = new AiBridgeClient(
        this.host,
        this.options.token,
        socket,
        (changed, clientName) => {
          if (changed) this.publishClientStatus('connected', clientName)
          return this.getClientStatus()
        },
        () => {
          const wasRegistered = client.isRegistered()
          const clientName = client.getClientName()
          this.clients.delete(client)
          if (wasRegistered) this.publishClientStatus('disconnected', clientName)
        }
      )
      this.clients.add(client)
      client.start()
    })
    this.server = server

    await new Promise<void>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException): void => {
        server.removeListener('listening', onListening)
        this.server = null
        reject(error)
      }
      const onListening = (): void => {
        server.removeListener('error', onError)
        this.writeEndpointFile()
        this.options.logger?.info?.(`AI bridge listening on ${this.options.pipeName}`)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(this.options.pipeName)
    })
  }

  async stop(): Promise<void> {
    if (this.stopping) return
    this.stopping = true
    for (const client of this.clients) client.close()
    this.clients.clear()
    const server = this.server
    this.server = null
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
    }
    if (this.options.endpointFile && this.endpointWritten) {
      try {
        fs.rmSync(this.options.endpointFile, { force: true })
        this.endpointWritten = false
      } catch {
        /* best effort */
      }
    }
    this.options.logger?.info?.('AI bridge stopped')
  }

  /** 返回已完成 `client_hello` 且仍保持 Pipe 连接的客户端。 */
  getClientStatus(): AiBridgeClientStatus {
    const clientNames = Array.from(this.clients)
      .filter((client) => client.isRegistered())
      .map((client) => client.getClientName())
      .filter((name): name is string => Boolean(name))
    return {
      connected: clientNames.length > 0,
      clientCount: clientNames.length,
      clientNames
    }
  }

  private publishClientStatus(change: 'connected' | 'disconnected', clientName?: string): void {
    this.host.events.publish({
      eventType: 'ai.client.changed',
      source: 'ai',
      payload: {
        ...this.getClientStatus(),
        change,
        ...(clientName ? { clientName } : {})
      }
    })
  }

  private writeEndpointFile(): void {
    if (!this.options.endpointFile) return
    try {
      fs.mkdirSync(path.dirname(this.options.endpointFile), { recursive: true })
      fs.writeFileSync(
        this.options.endpointFile,
        JSON.stringify(
          {
            pipeName: this.options.pipeName,
            token: this.options.token,
            instance: this.host.instance
          },
          null,
          2
        ),
        'utf8'
      )
      this.endpointWritten = true
    } catch (error) {
      this.options.logger?.warn?.(
        `AI bridge endpoint file unavailable: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

class AiBridgeClient {
  private buffer = ''
  private authenticated = false
  private closed = false
  private nextSubscriptionId = 1
  private readonly attachments = new Map<string, Attachment>()
  private readonly subscriptions = new Map<string, BridgeSubscription>()
  private readonly outboundQueue: OutboundFrame[] = []
  private outboundQueueBytes = 0
  private writePaused = false
  private readonly pendingGaps = new Map<string, { droppedEvents: number; droppedBytes: number }>()
  private clientName: string | null = null

  constructor(
    private readonly host: AiBridgeHost,
    private readonly token: string,
    private readonly socket: net.Socket,
    private readonly onRegistered: (changed: boolean, clientName: string) => AiBridgeClientStatus,
    private readonly onClosed: () => void
  ) {}

  isRegistered(): boolean {
    return this.clientName !== null
  }

  getClientName(): string | undefined {
    return this.clientName || undefined
  }

  start(): void {
    this.socket.setEncoding('utf8')
    this.socket.on('data', (chunk: string | Buffer) => this.onData(String(chunk)))
    this.socket.on('drain', () => this.onDrain())
    this.socket.on('error', () => this.close())
    this.socket.on('close', () => this.close())
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const subscription of this.subscriptions.values()) {
      subscription.unsubscribe()
      subscription.releaseRxCapture?.()
    }
    this.subscriptions.clear()
    for (const attachment of this.attachments.values()) attachment.releaseRxCapture()
    this.attachments.clear()
    this.outboundQueue.length = 0
    this.outboundQueueBytes = 0
    this.pendingGaps.clear()
    this.socket.destroy()
    this.onClosed()
  }

  private onData(chunk: string): void {
    this.buffer += chunk

    let newlineIndex = this.buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '')
      this.buffer = this.buffer.slice(newlineIndex + 1)
      newlineIndex = this.buffer.indexOf('\n')
      if (!line.trim()) continue
      if (Buffer.byteLength(line, 'utf8') > MAX_FRAME_BYTES) {
        this.rejectOversizedFrame()
        return
      }
      void this.handleLine(line)
    }

    // 上限约束的是单条 NDJSON 帧。一次 socket data 事件可能包含很多条
    // 合法小请求，不能因为整个 chunk 超过 1 MiB 就误判为超大帧。
    if (Buffer.byteLength(this.buffer, 'utf8') > MAX_FRAME_BYTES) {
      this.rejectOversizedFrame()
    }
  }

  private rejectOversizedFrame(): void {
    this.sendError(
      null,
      new AiBridgeRpcError('FRAME_TOO_LARGE', 'NDJSON frame exceeds 1 MiB', -32600)
    )
    this.close()
  }

  private async handleLine(line: string): Promise<void> {
    let request: RpcRequest
    try {
      request = JSON.parse(line) as RpcRequest
    } catch {
      this.sendError(null, new AiBridgeRpcError('INVALID_JSON', 'Invalid JSON frame', -32700))
      return
    }

    const id = request.id === undefined ? null : request.id
    try {
      if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
        throw new AiBridgeRpcError('INVALID_REQUEST', 'Expected JSON-RPC 2.0 request', -32600)
      }
      const params = asParams(request.params)
      const result = await this.dispatch(request.method, params)
      this.publishActivity(request.method, params, 'success')
      if (request.id !== undefined) this.send({ jsonrpc: '2.0', id, result })
    } catch (error) {
      if (typeof request.method === 'string') {
        this.publishActivity(
          request.method,
          asParams(request.params),
          'failed',
          this.getErrorCode(error)
        )
      }
      if (request.id !== undefined) this.sendError(id, error)
    }
  }

  private publishActivity(
    method: string,
    params: Record<string, unknown>,
    status: 'success' | 'failed',
    errorCode?: string
  ): void {
    if (method === 'auth') return
    const access = getAiBridgeMethodAccess(method, params)
    this.host.events.publish({
      eventType: 'ai.activity',
      source: 'ai',
      sessionId: typeof params.sessionId === 'string' ? params.sessionId : undefined,
      payload: {
        method,
        action: access === 'read' ? 'read' : 'control',
        status,
        details: getActivityDetails(method, params),
        ...(errorCode ? { errorCode } : {})
      }
    })
  }

  private getErrorCode(error: unknown): string {
    if (error instanceof AiBridgeRpcError) return error.code
    if (error instanceof AiBridgePolicyError) return error.code
    if (error instanceof ConfigServiceError) return error.code
    return 'INTERNAL_ERROR'
  }

  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (method === 'auth') return this.auth(params)
    this.requireAuth()
    this.host.access.assertMethod(method, params)

    switch (method) {
      case 'get_info':
        return {
          instance: this.host.instance,
          latestSequence: this.host.events.getLatestSequence(),
          bridge: this.host.access.getState(),
          capabilities: this.host.access.getCapabilities()
        }
      case 'get_capabilities':
        return {
          bridge: this.host.access.getState(),
          capabilities: this.host.access.getCapabilities()
        }
      case 'client_hello':
        return this.registerClient(params)
      case 'list_sessions':
        return { sessions: this.host.connections.listSessions() }
      case 'start_session':
        return this.startSession(params)
      case 'start_port_session':
        return this.startPortSession(params)
      case 'stop_session':
        return this.stopSession(params)
      case 'list_connections':
        return { connections: this.host.catalog.listConnections() }
      case 'create_connection': {
        const input = this.requireConnection(this.requireObject(params.connection, 'connection'))
        const connection = this.requireCatalogResult(
          this.host.catalog.createConnection(input),
          'create connection'
        )
        return { connection, revision: this.recordCatalogChange('connections', 'created') }
      }
      case 'update_connection': {
        const connection = this.requireObject(params.connection, 'connection')
        const connectionWithId = this.requireConnectionWithId(connection)
        const existingConnection = this.host.catalog
          .listConnections()
          .find(
            (item) =>
              item !== null &&
              typeof item === 'object' &&
              Number((item as Record<string, unknown>).id) === connectionWithId.id
          )
        const result = this.requireCatalogResult(
          this.host.catalog.updateConnection(
            this.requireConnection(connectionWithId, existingConnection as Record<string, unknown> | undefined)
          ),
          'update connection'
        )
        return { connection: result, revision: this.recordCatalogChange('connections', 'updated') }
      }
      case 'delete_connection': {
        const connectionId = this.requirePositiveInteger(params.connectionId, 'connectionId')
        this.requireCatalogItem(
          this.host.catalog.listConnections(),
          'id',
          connectionId,
          'connection'
        )
        const connections = this.host.catalog.deleteConnection(connectionId)
        return { connections, revision: this.recordCatalogChange('connections', 'deleted') }
      }
      case 'list_command_groups':
        return { groups: this.host.catalog.listCommandGroups() }
      case 'create_command_group': {
        const group = this.requireCatalogResult(
          this.host.catalog.createCommandGroup(
            this.requireCommandGroup(this.requireObject(params.group, 'group'))
          ),
          'create command group'
        )
        return { group, revision: this.recordCatalogChange('command-groups', 'created') }
      }
      case 'update_command_group': {
        const group = this.requireObject(params.group, 'group')
        const result = this.requireCatalogResult(
          this.host.catalog.updateCommandGroup(
            this.requireCommandGroup(this.requireGroupWithId(group))
          ),
          'update command group'
        )
        return { group: result, revision: this.recordCatalogChange('command-groups', 'updated') }
      }
      case 'delete_command_group': {
        const groupId = this.requirePositiveInteger(params.groupId, 'groupId')
        this.requireCatalogItem(
          this.host.catalog.listCommandGroups(),
          'groupId',
          groupId,
          'command group'
        )
        const groups = this.host.catalog.deleteCommandGroup(groupId)
        return {
          groups,
          revision: this.recordCatalogChange('command-groups', 'deleted'),
          presetCommandsRevision: this.recordCatalogChange('preset-commands', 'deleted-by-group')
        }
      }
      case 'list_preset_commands':
        return { commands: this.host.catalog.listPresetCommands() }
      case 'create_preset_command': {
        const command = this.requireCatalogResult(
          this.host.catalog.createPresetCommand(
            this.requirePresetCommand(this.requireObject(params.command, 'command'))
          ),
          'create preset command'
        )
        return { command, revision: this.recordCatalogChange('preset-commands', 'created') }
      }
      case 'update_preset_command': {
        const command = this.requireObject(params.command, 'command')
        const result = this.requireCatalogResult(
          this.host.catalog.updatePresetCommand(
            this.requirePresetCommand(this.requireCommandWithId(command))
          ),
          'update preset command'
        )
        return { command: result, revision: this.recordCatalogChange('preset-commands', 'updated') }
      }
      case 'delete_preset_command': {
        const commandId = this.requirePositiveInteger(params.commandId, 'commandId')
        this.requireCatalogItem(
          this.host.catalog.listPresetCommands(),
          'id',
          commandId,
          'preset command'
        )
        const commands = this.host.catalog.deletePresetCommand(commandId)
        return { commands, revision: this.recordCatalogChange('preset-commands', 'deleted') }
      }
      case 'attach_session':
        return this.attachSession(params)
      case 'detach_session':
        return this.detachSession(params)
      case 'send':
        return this.sendCommand(params)
      case 'list_serial_ports':
        return { ports: await this.host.serialPorts.list() }
      case 'read_events':
        return this.readEvents(params)
      case 'read_buffer':
        return this.readBuffer(params)
      case 'read_log_tail':
        return this.host.logs.readTail(asString(params.sessionId, 'sessionId'), {
          maxBytes: asNumber(params.maxBytes, 32 * 1024),
          maxLines: asNumber(params.maxLines, 200)
        })
      case 'search_log':
        return this.host.logs.search(
          asString(params.sessionId, 'sessionId'),
          asString(params.query, 'query'),
          {
            fromOffset: typeof params.fromOffset === 'number' ? params.fromOffset : undefined,
            maxScanBytes: asNumber(params.maxScanBytes, 512 * 1024),
            maxMatches: asNumber(params.maxMatches, 50),
            contextLines: asNumber(params.contextLines, 2),
            caseSensitive: params.caseSensitive === true
          }
        )
      case 'subscribe':
        return this.subscribe(params)
      case 'unsubscribe':
        return this.unsubscribe(params)
      case 'describe_config':
        return {
          domains: this.describeCoreConfig(
            typeof params.domain === 'string' ? params.domain : undefined
          )
        }
      case 'get_config': {
        const domain = asString(params.domain, 'domain')
        this.host.access.assertConfigDomain(domain)
        return this.host.access.filterConfigSnapshot(
          this.host.config.get(domain, typeof params.targetId === 'string' ? params.targetId : null)
        )
      }
      case 'patch_config':
        return this.patchConfig(params)
      default:
        throw new AiBridgeRpcError('METHOD_NOT_FOUND', `Unknown method: ${method}`, -32601)
    }
  }

  private auth(params: Record<string, unknown>): unknown {
    const suppliedToken = typeof params.token === 'string' ? params.token : ''
    if (!constantTimeEqual(suppliedToken, this.token)) {
      throw new AiBridgeRpcError('AUTH_FAILED', 'Invalid bridge token', -32001)
    }
    this.authenticated = true
    return {
      authenticated: true
    }
  }

  private registerClient(params: Record<string, unknown>): unknown {
    const clientName = asString(params.clientName, 'clientName').trim()
    if (clientName.length === 0) {
      throw new AiBridgeRpcError('INVALID_PARAMS', 'clientName must not be blank', -32602)
    }
    if (clientName.length > 80) {
      throw new AiBridgeRpcError(
        'INVALID_PARAMS',
        'clientName must be 80 characters or fewer',
        -32602
      )
    }
    const changed = this.clientName !== clientName
    this.clientName = clientName
    return {
      registered: true,
      clientName,
      instance: this.host.instance,
      clients: this.onRegistered(changed, clientName)
    }
  }

  private attachSession(params: Record<string, unknown>): unknown {
    const sessionId = asString(params.sessionId, 'sessionId')
    const session = this.host.connections.getSession(sessionId)
    if (!session)
      throw new AiBridgeRpcError('SESSION_NOT_FOUND', `Session not found: ${sessionId}`, -32004)
    const mode = params.mode === 'write' ? 'write' : 'read'
    this.attachments.get(sessionId)?.releaseRxCapture()
    this.attachments.set(sessionId, {
      mode,
      releaseRxCapture: this.host.events.acquireRxCapture([sessionId])
    })
    return { attached: true, mode, session }
  }

  private async startSession(params: Record<string, unknown>): Promise<object> {
    if (!this.host.lifecycle)
      throw new AiBridgeRpcError('LIFECYCLE_UNAVAILABLE', 'Session lifecycle is unavailable')
    if (
      typeof params.connectionId !== 'number' ||
      !Number.isInteger(params.connectionId) ||
      params.connectionId <= 0
    ) {
      throw new AiBridgeRpcError(
        'INVALID_PARAMS',
        'connectionId must be a positive integer',
        -32602
      )
    }
    const sessionId =
      typeof params.sessionId === 'string' && params.sessionId.length > 0
        ? params.sessionId
        : `ai-${params.connectionId}-${Date.now()}`
    const extraFields =
      params.extraFields &&
      typeof params.extraFields === 'object' &&
      !Array.isArray(params.extraFields)
        ? (params.extraFields as Record<string, unknown>)
        : undefined
    return this.host.lifecycle.startByConnectionId(params.connectionId, sessionId, extraFields)
  }

  private async startPortSession(params: Record<string, unknown>): Promise<object> {
    if (!this.host.lifecycle.startByPort) {
      throw new AiBridgeRpcError('LIFECYCLE_UNAVAILABLE', 'Port session lifecycle is unavailable')
    }

    const requestedPortPath = normalizePortPath(params.portPath)
    const listedPorts = await this.host.serialPorts.list()
    const matchedPortPath = listedPorts
      .map(getListedPortPath)
      .find((portPath): portPath is string => Boolean(portPath && samePortPath(portPath, requestedPortPath)))

    if (!matchedPortPath) {
      throw new AiBridgeRpcError(
        'PORT_NOT_FOUND',
        `Serial port is not currently available: ${requestedPortPath}`,
        -32004
      )
    }

    const sessionKey = matchedPortPath.replace(/[^a-zA-Z0-9_-]+/g, '-')
    const sessionId =
      typeof params.sessionId === 'string' && params.sessionId.length > 0
        ? params.sessionId
        : `ai-port-${sessionKey}-${Date.now()}`
    const extraFields: Record<string, unknown> = {}
    const allowedFields = [
      'name',
      'remark',
      'baudRate',
      'dataBits',
      'stopBits',
      'parity',
      'encoding',
      'readTimeout',
      'writeTimeout',
      'flowControl',
      'rts',
      'dtr',
      'receiveHex',
      'logTimestamp'
    ]
    for (const field of allowedFields) {
      if (params[field] !== undefined) extraFields[field] = params[field]
    }

    const result = await this.host.lifecycle.startByPort(
      matchedPortPath,
      sessionId,
      extraFields
    )
    return { ...result, portPath: matchedPortPath, sessionId }
  }

  private async stopSession(params: Record<string, unknown>): Promise<object> {
    if (!this.host.lifecycle)
      throw new AiBridgeRpcError('LIFECYCLE_UNAVAILABLE', 'Session lifecycle is unavailable')
    return this.host.lifecycle.stop(asString(params.sessionId, 'sessionId'))
  }

  private requireObject(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new AiBridgeRpcError('INVALID_PARAMS', `${field} must be an object`, -32602)
    }
    return value as Record<string, unknown>
  }

  private requirePositiveInteger(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new AiBridgeRpcError('INVALID_PARAMS', `${field} must be a positive integer`, -32602)
    }
    return value
  }

  private requireConnectionWithId(connection: Record<string, unknown>): Record<string, unknown> {
    return { ...connection, id: this.requirePositiveInteger(connection.id, 'connection.id') }
  }

  /**
   * AI 目录写入沿用 GUI 的最低必填规则，并禁止创建 GUI 未公开的串口保存档案。
   * 系统实时串口由 `start_port_session` 处理，避免把临时端口伪装成持久化配置。
   */
  private requireConnection(
    connection: Record<string, unknown>,
    existingConnection?: Record<string, unknown>
  ): Record<string, unknown> {
    this.requireTextField(connection, 'name', 'connection')
    this.requireTextField(connection, 'connectionType', 'connection')

    const connectionType = connection.connectionType as string
    if (
      !(AI_GUI_SAVED_CONNECTION_TYPES as readonly string[]).includes(connectionType) ||
      (existingConnection && existingConnection.connectionType !== connectionType)
    ) {
      throw new AiBridgeRpcError(
        'CONNECTION_TYPE_NOT_EXPOSED',
        'AI saved connection writes support only GUI-exposed Telnet and FTP profiles; use start_port_session for live serial ports',
        -32014,
        {
          allowedConnectionTypes: [...AI_GUI_SAVED_CONNECTION_TYPES],
          serialPortMethod: 'start_port_session'
        }
      )
    }
    return connection
  }

  private requireCommandGroup(group: Record<string, unknown>): Record<string, unknown> {
    this.requireTextField(group, 'name', 'group')
    this.requireTextField(group, 'connectionType', 'group')
    return group
  }

  private requirePresetCommand(command: Record<string, unknown>): Record<string, unknown> {
    return {
      ...command,
      groupId: this.requirePositiveInteger(command.groupId, 'command.groupId')
    }
  }

  private requireTextField(record: Record<string, unknown>, field: string, owner: string): void {
    const value = record[field]
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new AiBridgeRpcError(
        'INVALID_PARAMS',
        `${owner}.${field} must be a non-empty string`,
        -32602
      )
    }
  }

  private requireCatalogResult<T>(result: T, operation: string): NonNullable<T> {
    if (result === null || result === undefined || result === '') {
      throw new AiBridgeRpcError('CATALOG_OPERATION_FAILED', `Failed to ${operation}`, -32010)
    }
    return result as NonNullable<T>
  }

  private requireCatalogItem(
    items: unknown[],
    idField: string,
    id: number,
    itemName: string
  ): void {
    const found = items.some(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        Number((item as Record<string, unknown>)[idField]) === id
    )
    if (!found) {
      throw new AiBridgeRpcError('CATALOG_ITEM_NOT_FOUND', `${itemName} not found: ${id}`, -32004)
    }
  }

  private requireGroupWithId(group: Record<string, unknown>): Record<string, unknown> {
    return { ...group, groupId: this.requirePositiveInteger(group.groupId, 'group.groupId') }
  }

  private requireCommandWithId(command: Record<string, unknown>): Record<string, unknown> {
    return { ...command, id: this.requirePositiveInteger(command.id, 'command.id') }
  }

  private recordCatalogChange(domain: string, operation: string): number {
    return this.host.config.recordExternalChange(domain, null, { operation }).revision
  }

  private describeCoreConfig(domain?: string): unknown[] {
    if (domain) {
      this.host.access.assertConfigDomain(domain)
      return this.host.config
        .describe(domain)
        .map((schema) => this.host.access.filterConfigSchema(schema))
    }
    return this.host.config
      .describe()
      .filter((schema) => {
        try {
          this.host.access.filterConfigSchema(schema)
          return true
        } catch {
          return false
        }
      })
      .map((schema) => this.host.access.filterConfigSchema(schema))
  }

  private detachSession(params: Record<string, unknown>): unknown {
    const sessionId = asString(params.sessionId, 'sessionId')
    this.attachments.get(sessionId)?.releaseRxCapture()
    this.attachments.delete(sessionId)
    return { detached: true, sessionId }
  }

  private async sendCommand(params: Record<string, unknown>): Promise<object> {
    const sessionId = asString(params.sessionId, 'sessionId')
    const attachment = this.attachments.get(sessionId)
    if (!attachment || attachment.mode !== 'write') {
      throw new AiBridgeRpcError(
        'WRITE_ATTACH_REQUIRED',
        'Attach the session with mode=write before send',
        -32003
      )
    }
    if (typeof params.bytesBase64 === 'string') {
      throw new AiBridgeRpcError(
        'SOFTWARE_SEND_TEXT_REQUIRED',
        'send must use text so SuperConnectX can apply its command-box rules; configure HEX mode through com-settings first',
        -32602
      )
    }

    const input = asString(params.text, 'text')
    const session = this.host.connections.getSession(sessionId)
    if (!session)
      throw new AiBridgeRpcError('SESSION_NOT_FOUND', `Session not found: ${sessionId}`, -32004)

    const settings: Record<string, unknown> =
      session.connectionType === 'com' && session.comName
        ? this.host.config.get('com-settings', session.comName).value || {}
        : {}

    let prepared
    try {
      prepared = await prepareCommand(
        input,
        {
          autoNewline: settings.autoNewline !== false,
          hexMode: settings.hexMode === true,
          crcEnabled: settings.crcEnabled !== false,
          crcMethod: typeof settings.crcMethod === 'string' ? settings.crcMethod : 'CRC-16/MODBUS'
        },
        async (hexData, method) => checkData(method, hexData).hexResult
      )
    } catch (error) {
      throw new AiBridgeRpcError(
        'COMMAND_PREPARATION_FAILED',
        error instanceof Error ? error.message : String(error),
        -32602
      )
    }

    return this.host.connections.send(sessionId, prepared.data, 'ai', undefined, {
      input: prepared.input,
      displayCommand: prepared.displayCommand,
      preparedBySoftware: true
    })
  }

  private readEvents(params: Record<string, unknown>): unknown {
    const filter = makeFilter(params)
    return this.host.events.readSince(
      asNumber(params.afterSequence, 0),
      asNumber(params.limit, 100),
      filter,
      asNumber(params.maxBytes, 64 * 1024)
    )
  }

  private readBuffer(params: Record<string, unknown>): unknown {
    const sessionId = asString(params.sessionId, 'sessionId')
    if (!this.attachments.has(sessionId))
      throw new AiBridgeRpcError('ATTACH_REQUIRED', 'Attach the session before reading', -32003)
    return this.host.events.readSince(
      asNumber(params.afterSequence, 0),
      asNumber(params.limit, 100),
      {
        sessionIds: [sessionId],
        eventTypes: ['rx.display', 'tx.accepted', 'tx.failed', 'session.state', 'session.closed']
      },
      asNumber(params.maxBytes, 64 * 1024)
    )
  }

  private subscribe(params: Record<string, unknown>): unknown {
    const subscriptionId = `sub-${this.nextSubscriptionId++}`
    const filter = makeFilter(params)
    if (!filter?.eventTypes || filter.eventTypes.length === 0) {
      throw new AiBridgeRpcError(
        'INVALID_PARAMS',
        'subscribe requires an explicit eventTypes filter',
        -32602
      )
    }
    const wantsRx = filter.eventTypes.includes('rx.display')
    if (wantsRx && (!filter.sessionIds || filter.sessionIds.length === 0)) {
      throw new AiBridgeRpcError(
        'INVALID_PARAMS',
        'rx.display subscriptions require explicit sessionIds',
        -32602
      )
    }
    const afterSequence = asNumber(params.afterSequence, 0)
    const unsubscribe = this.host.events.subscribe((event) => {
      if (!this.host.access.getState().enabled) return
      this.send(
        { jsonrpc: '2.0', method: 'event', params: { subscriptionId, event } },
        { droppable: event.eventType === 'rx.display', subscriptionId }
      )
    }, filter)
    const releaseRxCapture = wantsRx
      ? this.host.events.acquireRxCapture(filter.sessionIds || [])
      : undefined
    this.subscriptions.set(subscriptionId, { unsubscribe, releaseRxCapture })
    const replay = this.host.events.readSince(
      afterSequence,
      asNumber(params.limit, 100),
      filter,
      asNumber(params.maxBytes, 64 * 1024)
    )
    return { subscriptionId, replay, latestSequence: this.host.events.getLatestSequence() }
  }

  private unsubscribe(params: Record<string, unknown>): unknown {
    const subscriptionId = asString(params.subscriptionId, 'subscriptionId')
    const subscription = this.subscriptions.get(subscriptionId)
    subscription?.unsubscribe()
    subscription?.releaseRxCapture?.()
    this.subscriptions.delete(subscriptionId)
    return { unsubscribed: true, subscriptionId }
  }

  private async patchConfig(params: Record<string, unknown>): Promise<unknown> {
    const domain = asString(params.domain, 'domain')
    const patch = params.patch
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new AiBridgeRpcError('INVALID_PARAMS', 'patch must be an object', -32602)
    }
    this.host.access.assertConfigDomain(domain, patch as Record<string, unknown>)
    const expectedRevision =
      typeof params.expectedRevision === 'number' ? params.expectedRevision : undefined
    const result = await this.host.config.patch({
      domain,
      targetId: typeof params.targetId === 'string' ? params.targetId : null,
      patch: patch as Record<string, unknown>,
      expectedRevision,
      source: 'ai'
    })
    return { ...result, snapshot: this.host.access.filterConfigSnapshot(result.snapshot) }
  }

  private requireAuth(): void {
    if (!this.authenticated)
      throw new AiBridgeRpcError('AUTH_REQUIRED', 'Authenticate before calling this method', -32001)
  }

  private send(
    response: RpcResponse | { jsonrpc: '2.0'; method: string; params: unknown },
    options: { droppable?: boolean; subscriptionId?: string } = {}
  ): void {
    if (this.closed || this.socket.destroyed) return
    const value = `${JSON.stringify(response)}\n`
    const bytes = Buffer.byteLength(value, 'utf8')
    if (bytes > MAX_RESPONSE_BYTES) {
      if (options.droppable && options.subscriptionId) {
        this.recordStreamGap(options.subscriptionId, bytes)
        return
      }
      const id = 'id' in response ? response.id : null
      const errorValue = `${JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32013,
          message: 'Response exceeds 1 MiB',
          data: { code: 'RESPONSE_TOO_LARGE', maxBytes: MAX_RESPONSE_BYTES }
        }
      })}\n`
      this.enqueueOrWrite({
        value: errorValue,
        bytes: Buffer.byteLength(errorValue, 'utf8'),
        droppable: false
      })
      return
    }
    this.enqueueOrWrite({
      value,
      bytes,
      droppable: options.droppable === true,
      subscriptionId: options.subscriptionId
    })
  }

  private enqueueOrWrite(frame: OutboundFrame): void {
    if (!this.writePaused && this.outboundQueue.length === 0) {
      this.writePaused = !this.socket.write(frame.value)
      return
    }

    if (this.outboundQueueBytes + frame.bytes > MAX_OUTBOUND_QUEUE_BYTES) {
      if (frame.droppable && frame.subscriptionId) {
        this.recordStreamGap(frame.subscriptionId, frame.bytes)
        return
      }
      this.close()
      return
    }
    this.outboundQueue.push(frame)
    this.outboundQueueBytes += frame.bytes
  }

  private onDrain(): void {
    if (this.closed) return
    this.writePaused = false
    while (!this.writePaused && this.outboundQueue.length > 0) {
      const frame = this.outboundQueue.shift()
      if (!frame) break
      this.outboundQueueBytes -= frame.bytes
      this.writePaused = !this.socket.write(frame.value)
    }
    if (!this.writePaused && this.outboundQueue.length === 0) this.flushStreamGaps()
  }

  private recordStreamGap(subscriptionId: string, bytes: number): void {
    const current = this.pendingGaps.get(subscriptionId) || { droppedEvents: 0, droppedBytes: 0 }
    current.droppedEvents += 1
    current.droppedBytes += bytes
    this.pendingGaps.set(subscriptionId, current)
    if (!this.writePaused && this.outboundQueue.length === 0) {
      setImmediate(() => this.flushStreamGaps())
    }
  }

  private flushStreamGaps(): void {
    for (const [subscriptionId, gap] of this.pendingGaps) {
      const value = `${JSON.stringify({
        jsonrpc: '2.0',
        method: 'stream.gap',
        params: {
          subscriptionId,
          ...gap,
          nextCursor: this.host.events.getLatestSequence()
        }
      })}\n`
      const frame: OutboundFrame = {
        value,
        bytes: Buffer.byteLength(value, 'utf8'),
        droppable: false
      }
      if (this.outboundQueueBytes + frame.bytes > MAX_OUTBOUND_QUEUE_BYTES) return
      this.pendingGaps.delete(subscriptionId)
      this.enqueueOrWrite(frame)
      if (this.writePaused) return
    }
  }

  private sendError(id: string | number | null, error: unknown): void {
    const rpcError = this.toRpcError(error)
    this.send({
      jsonrpc: '2.0',
      id,
      error: {
        code: rpcError.rpcCode,
        message: rpcError.message,
        data: { code: rpcError.code, details: rpcError.data }
      }
    })
  }

  private toRpcError(error: unknown): AiBridgeRpcError {
    if (error instanceof AiBridgeRpcError) return error
    if (error instanceof AiBridgePolicyError) {
      const rpcCode =
        error.code === 'BRIDGE_DISABLED'
          ? -32010
          : error.code === 'AI_READ_ONLY'
            ? -32011
            : error.code === 'CONFIG_SCOPE_DENIED'
              ? -32012
              : -32601
      return new AiBridgeRpcError(error.code, error.message, rpcCode)
    }
    if (error instanceof ConfigServiceError) {
      const rpcCode = error.code === 'CONFIG_REVISION_CONFLICT' ? -32009 : -32602
      const snapshot = error.snapshot
      return new AiBridgeRpcError(
        error.code,
        error.message,
        rpcCode,
        snapshot
          ? {
              domain: snapshot.domain,
              targetId: snapshot.targetId,
              currentRevision: snapshot.revision
            }
          : undefined
      )
    }
    return new AiBridgeRpcError(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : String(error)
    )
  }
}
