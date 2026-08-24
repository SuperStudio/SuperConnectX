import { EventEmitter } from 'events'
import { createServer, type Server as HttpServer } from 'http'
import { randomUUID } from 'crypto'
import express, { type Request, type Response } from 'express'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import type {
  AiSelfTestResult,
  AiServiceStatus,
  McpServiceState
} from '../../../../../shared/extensions/ai-control/AiServiceTypes'
import AiConfigService from '../../infrastructure/AiConfigService'
import SessionLeaseService from '../../application/SessionLeaseService'
import McpAdapter, { type PendingMcpServer } from './McpAdapter'
import McpHttpSecurity from './McpHttpSecurity'
import McpSessionStore, { type McpSessionRecord } from './McpSessionStore'
import type { AuditPort } from '../../ports/AuditPort'
import RuntimeAuthorizationService from '../../application/RuntimeAuthorizationService'
import type { AiPermission } from '../../../../../shared/extensions/ai-control/AiConfigTypes'

const SESSION_IDLE_MS = 30 * 60_000
const MAX_GLOBAL_CONCURRENT = 32
const MAX_SESSION_CONCURRENT = 8

export default class McpServerManager {
  private state: McpServiceState = 'disabled'
  private lastError?: string
  private endpoint = ''
  private port = 0
  private server?: HttpServer
  private readonly sessions = new McpSessionStore(32)
  private readonly events = new EventEmitter()
  private idleTimer?: NodeJS.Timeout
  private globalConcurrent = 0
  private bootstrapTokens = 20
  private bootstrapRefillAt = Date.now()
  private operation: Promise<void> = Promise.resolve()

  constructor(
    private readonly instanceIndex: number,
    private readonly config: AiConfigService,
    private readonly adapter: McpAdapter,
    private readonly leases: SessionLeaseService,
    private readonly authorization: RuntimeAuthorizationService,
    private readonly audit?: AuditPort
  ) {}

  start(): Promise<void> {
    return this.serialize(() => this.startInternal())
  }

  stop(): Promise<void> {
    return this.serialize(() => this.stopInternal())
  }

  reconcile(): Promise<void> {
    return this.serialize(async () => {
      const instance = this.config.getInstance()
      const nextPort =
        instance.portOverride ?? this.config.get().shared.basePort + this.instanceIndex
      if (!instance.enabled) {
        this.authorization.reset()
        await this.stopInternal()
        return
      }
      if (this.state === 'running' && nextPort === this.port) {
        this.refreshPolicy()
        return
      }
      await this.stopInternal()
      await this.startInternal()
    })
  }

  async invalidateSessions(): Promise<void> {
    await this.closeAllSessions('Token rotated')
    this.emitState()
  }

  setPermission(permission: AiPermission): AiServiceStatus {
    this.authorization.setPermission(permission)
    this.refreshPolicy()
    this.emitState()
    return this.getStatus()
  }

  getStatus(): AiServiceStatus {
    const doc = this.config.get()
    const instance = this.config.getInstance()
    const clients = this.sessions.clients()
    return {
      state: this.state,
      permission: this.authorization.getPermission(),
      instanceIndex: this.instanceIndex,
      instanceAlias: instance.alias,
      endpoint: this.endpoint,
      port: this.port,
      clientCount: clients.length,
      clients,
      lastError: this.lastError,
      configRevision: doc.revision,
      tokenFingerprint: this.fingerprint(instance.token)
    }
  }

  onStateChanged(listener: (status: AiServiceStatus) => void): () => void {
    this.events.on('state', listener)
    return () => this.events.off('state', listener)
  }

  async runSelfTest(): Promise<AiSelfTestResult> {
    const started = Date.now()
    if (this.state !== 'running')
      return { success: false, message: 'MCP service is not running', durationMs: 0 }
    const client = new Client({ name: 'superconnectx-self-test', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(this.endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${this.config.getInstance().token}` } }
    })
    try {
      await Promise.race([
        (async () => {
          await client.connect(transport)
          const tools = await client.listTools()
          await client.callTool({ name: 'server_get_info', arguments: {} })
          return tools.tools.length
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Self-test timed out')), 5_000)
        )
      ])
      return {
        success: true,
        message: 'MCP service self-test passed',
        toolCount: this.adapter.toolCount(),
        durationMs: Date.now() - started
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started
      }
    } finally {
      await transport.terminateSession().catch(() => undefined)
      await client.close().catch(() => undefined)
    }
  }

  async dispose(): Promise<void> {
    await this.stop()
    this.events.removeAllListeners()
  }

  private async startInternal(): Promise<void> {
    const instance = this.config.getInstance()
    if (!instance.enabled) {
      this.setState('disabled')
      return
    }
    const port = instance.portOverride ?? this.config.get().shared.basePort + this.instanceIndex
    if (port > 65535) {
      this.lastError = 'MCP port exceeds 65535'
      this.setState('error')
      return
    }
    if (this.state === 'running' && this.port === port) return
    this.setState('starting')
    this.port = port
    this.endpoint = `http://127.0.0.1:${port}/mcp`

    const app = express()
    const security = new McpHttpSecurity(
      () => this.config.getInstance().token,
      () => `127.0.0.1:${this.port}`
    )
    app.use('/mcp', security.middleware)
    app.use('/mcp', express.json({ limit: '1mb', strict: true }))
    app.post('/mcp', (req, res) => void this.handlePost(req, res))
    app.get('/mcp', (req, res) => void this.handleExisting(req, res))
    app.delete('/mcp', (req, res) => void this.handleExisting(req, res))

    const server = createServer({ maxHeaderSize: 16 * 1024 }, app)
    server.headersTimeout = 10_000
    server.requestTimeout = 10_000
    try {
      await this.listenWithRetry(server, port)
      this.server = server
      this.lastError = undefined
      this.setState('running')
      this.idleTimer = setInterval(() => void this.cleanupIdle(), 60_000)
      this.idleTimer.unref()
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      this.setState(
        (error as NodeJS.ErrnoException).code === 'EADDRINUSE' ? 'port_conflict' : 'error'
      )
      await new Promise<void>((resolve) => server.close(() => resolve())).catch(() => undefined)
    }
  }

  private async stopInternal(): Promise<void> {
    if (!this.server && this.state === 'disabled') return
    this.setState('stopping')
    if (this.idleTimer) clearInterval(this.idleTimer)
    this.idleTimer = undefined
    await this.closeAllSessions('MCP service stopped')
    const server = this.server
    this.server = undefined
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    this.endpoint = ''
    this.port = 0
    this.setState('disabled')
  }

  private async handlePost(req: Request, res: Response): Promise<void> {
    if (!this.enterGlobal(res)) return
    try {
      const sessionId = this.sessionHeader(req)
      if (sessionId) {
        await this.dispatchExisting(sessionId, req, res)
        return
      }
      if (!isInitializeRequest(req.body)) {
        res.status(400).json({ error: 'MCP_SESSION_REQUIRED' })
        return
      }
      if (!this.consumeBootstrapToken() || !this.sessions.canCreate()) {
        res.status(429).json({ error: 'SERVER_BUSY', retryAfterMs: 1000 })
        return
      }
      await this.createSession(req, res)
    } catch (error) {
      if (!res.headersSent)
        res.status(500).json({
          error: 'MCP_INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error)
        })
    } finally {
      this.globalConcurrent -= 1
    }
  }

  private async handleExisting(req: Request, res: Response): Promise<void> {
    if (!this.enterGlobal(res)) return
    try {
      const sessionId = this.sessionHeader(req)
      if (!sessionId) {
        res.status(400).json({ error: 'MCP_SESSION_REQUIRED' })
        return
      }
      await this.dispatchExisting(sessionId, req, res)
    } finally {
      this.globalConcurrent -= 1
    }
  }

  private async createSession(req: Request, res: Response): Promise<void> {
    const pendingRef: { current?: PendingMcpServer } = {}
    let initializedSessionId: string | undefined
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        const pending = pendingRef.current
        if (!pending) throw new Error('MCP server was not prepared')
        const client = pending.server.server.getClientVersion()
        const now = new Date().toISOString()
        const record: McpSessionRecord = {
          sessionId,
          principalId: pending.principalId,
          server: pending.server,
          transport,
          handles: pending.handles,
          clientInfo: {
            sessionId,
            name: client?.name || 'unknown-client',
            version: client?.version,
            connectedAt: now,
            lastActivityAt: now
          },
          controllers: pending.controllers,
          concurrentRequests: 0,
          lastActivityAt: Date.now(),
          tokens: 20,
          lastRefillAt: Date.now(),
          closing: false,
          connectedAnnounced: false
        }
        this.sessions.add(record)
        initializedSessionId = sessionId
        transport.onclose = () => void this.closeSession(sessionId, 'Transport closed')
      },
      onsessionclosed: (sessionId) => void this.closeSession(sessionId, 'Client closed session')
    })
    const pending = await this.adapter.create(transport)
    pendingRef.current = pending
    try {
      await transport.handleRequest(req, res, req.body)
      if (initializedSessionId) this.announceConnectedSession(initializedSessionId, pending)
    } catch (error) {
      await transport.close().catch(() => undefined)
      await pending.server.close().catch(() => undefined)
      throw error
    }
  }

  private announceConnectedSession(sessionId: string, pending: PendingMcpServer): void {
    const record = this.sessions.get(sessionId)
    if (!record || record.connectedAnnounced) return
    const client = pending.server.server.getClientVersion()
    record.clientInfo.name = client?.name || 'unknown-client'
    record.clientInfo.version = client?.version
    record.connectedAnnounced = true
    this.audit?.record({
      operation: 'mcp_client_connected',
      action: 'read',
      status: 'success',
      principalId: pending.principalId,
      clientName: record.clientInfo.name,
      details: { version: record.clientInfo.version }
    })
    this.emitState()
  }

  private async dispatchExisting(sessionId: string, req: Request, res: Response): Promise<void> {
    const record = this.sessions.get(sessionId)
    if (!record) {
      res.status(404).json({ error: 'MCP_SESSION_NOT_FOUND' })
      return
    }
    if (!this.consumeSessionToken(record)) {
      res.status(429).json({ error: 'RATE_LIMITED', retryAfterMs: 500 })
      return
    }
    if (record.concurrentRequests >= MAX_SESSION_CONCURRENT) {
      res.status(429).json({ error: 'SESSION_BUSY', retryAfterMs: 250 })
      return
    }
    record.concurrentRequests += 1
    record.lastActivityAt = Date.now()
    try {
      await record.transport.handleRequest(req, res, req.body)
    } finally {
      record.concurrentRequests -= 1
      this.sessions.touch(sessionId)
      this.emitState()
    }
  }

  private enterGlobal(res: Response): boolean {
    if (this.globalConcurrent >= MAX_GLOBAL_CONCURRENT) {
      res.status(429).json({ error: 'SERVER_BUSY', retryAfterMs: 250 })
      return false
    }
    this.globalConcurrent += 1
    return true
  }

  private sessionHeader(req: Request): string | undefined {
    const value = req.headers['mcp-session-id']
    return typeof value === 'string' && value ? value : undefined
  }

  private consumeBootstrapToken(): boolean {
    const now = Date.now()
    this.bootstrapTokens = Math.min(
      20,
      this.bootstrapTokens + ((now - this.bootstrapRefillAt) / 1000) * 2
    )
    this.bootstrapRefillAt = now
    if (this.bootstrapTokens < 1) return false
    this.bootstrapTokens -= 1
    return true
  }

  private consumeSessionToken(record: McpSessionRecord): boolean {
    const now = Date.now()
    record.tokens = Math.min(20, record.tokens + ((now - record.lastRefillAt) / 1000) * 2)
    record.lastRefillAt = now
    if (record.tokens < 1) return false
    record.tokens -= 1
    return true
  }

  private async cleanupIdle(): Promise<void> {
    this.leases.releaseExpired()
    for (const record of this.sessions.expired(Date.now(), SESSION_IDLE_MS))
      await this.closeSession(record.sessionId, 'Session idle timeout')
  }

  private async closeSession(sessionId: string, reason: string): Promise<void> {
    const record = this.sessions.get(sessionId)
    if (!record || record.closing) return
    record.closing = true
    this.sessions.delete(sessionId)
    if (record.connectedAnnounced)
      this.audit?.record({
        operation: 'mcp_client_disconnected',
        action: 'read',
        status: 'success',
        principalId: record.principalId,
        clientName: record.clientInfo.name,
        details: { reason }
      })
    for (const controller of record.controllers) controller.abort(reason)
    this.leases.releaseAll(record.principalId)
    await record.transport.close().catch(() => undefined)
    await record.server.close().catch(() => undefined)
    this.emitState()
  }

  private async closeAllSessions(reason: string): Promise<void> {
    await Promise.all(
      this.sessions.list().map((record) => this.closeSession(record.sessionId, reason))
    )
    this.sessions.clear()
  }

  private refreshPolicy(): void {
    for (const record of this.sessions.list())
      this.adapter.refreshVisibility({
        server: record.server,
        principalId: record.principalId,
        handles: record.handles,
        controllers: record.controllers
      })
  }

  private async listenWithRetry(server: HttpServer, port: number): Promise<void> {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await new Promise<void>((resolve, reject) => {
          const onError = (error: Error): void => {
            server.off('listening', onListening)
            reject(error)
          }
          const onListening = (): void => {
            server.off('error', onError)
            resolve()
          }
          server.once('error', onError)
          server.once('listening', onListening)
          server.listen(port, '127.0.0.1')
        })
        return
      } catch (error) {
        lastError = error
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || attempt === 2) throw error
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)))
      }
    }
    throw lastError
  }

  private setState(state: McpServiceState): void {
    this.state = state
    this.emitState()
  }

  private emitState(): void {
    this.events.emit('state', this.getStatus())
  }

  private serialize(action: () => Promise<void>): Promise<void> {
    this.operation = this.operation.then(action, action)
    return this.operation
  }

  private fingerprint(token: string): string {
    return token ? `${token.slice(0, 4)}…${token.slice(-4)}` : ''
  }
}
