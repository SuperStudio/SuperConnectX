import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import crypto from 'node:crypto'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { McpFacade, McpPermissionPolicy } from './types.js'
import { DEFAULT_MCP_PERMISSION_POLICY } from './types.js'
import { createMcpServer, type CreateMcpServerOptions } from './server.js'
import type { McpAuditSink } from './audit.js'

const MAX_BODY_BYTES = 1_048_576
const MAX_SESSIONS = 16
const SESSION_IDLE_MS = 30 * 60_000

interface McpSession {
  transport: StreamableHTTPServerTransport
  close: () => Promise<void>
  idleTimer: NodeJS.Timeout
}

export async function startMcpStdio(
  facade: McpFacade,
  policy: McpPermissionPolicy = DEFAULT_MCP_PERMISSION_POLICY,
  audit?: McpAuditSink,
  components?: CreateMcpServerOptions['components']
): Promise<() => Promise<void>> {
  const server = createMcpServer(facade, policy, { audit, components })
  await server.connect(new StdioServerTransport())
  return () => server.close()
}

export class McpLoopbackServer {
  private readonly facade: McpFacade
  private token: Buffer
  private readonly sessions = new Map<string, McpSession>()
  private server: http.Server | null = null
  private port: number | null = null
  private policy: McpPermissionPolicy
  private audit?: McpAuditSink
  private components?: CreateMcpServerOptions['components']

  constructor(
    facade: McpFacade,
    token = crypto.randomBytes(32).toString('hex'),
    policy: McpPermissionPolicy = DEFAULT_MCP_PERMISSION_POLICY,
    audit?: McpAuditSink,
    components?: CreateMcpServerOptions['components']
  ) {
    this.facade = facade
    this.token = Buffer.from(token, 'utf8')
    this.policy = { ...DEFAULT_MCP_PERMISSION_POLICY, ...policy }
    this.audit = audit
    this.components = components
  }

  get permissionPolicy(): McpPermissionPolicy {
    return { ...this.policy }
  }

  setPermissionPolicy(policy: McpPermissionPolicy): void {
    this.policy = { ...DEFAULT_MCP_PERMISSION_POLICY, ...policy }
    for (const session of this.sessions.values()) void session.close()
  }

  get endpoint(): string | null {
    return this.port == null ? null : `http://127.0.0.1:${this.port}/mcp`
  }

  get status(): { enabled: boolean; port: number | null; endpoint: string | null } {
    return { enabled: this.server !== null, port: this.port, endpoint: this.endpoint }
  }

  getClientConfig(): { endpoint: string | null; token: string } {
    return { endpoint: this.endpoint, token: this.token.toString('utf8') }
  }

  rotateToken(token = crypto.randomBytes(32).toString('hex')): string {
    this.token = Buffer.from(token, 'utf8')
    for (const session of this.sessions.values()) void session.close()
    this.sessions.clear()
    return token
  }

  async start(port: number): Promise<{ port: number; endpoint: string }> {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new Error(`Invalid MCP port: ${port}`)
    }
    if (this.server) throw new Error('MCP HTTP server is already running')

    const server = http.createServer((req, res) => {
      void this.handleRequest(req, res)
    })
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening)
        reject(error)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, '127.0.0.1')
    })
    this.server = server
    this.port = port
    return { port, endpoint: this.endpoint! }
  }

  async close(): Promise<void> {
    const sessions = Array.from(this.sessions.values())
    this.sessions.clear()
    await Promise.allSettled(sessions.map((session) => session.close()))
    const server = this.server
    this.server = null
    this.port = null
    if (!server) return
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (!this.isAuthorized(req)) {
        this.sendError(res, 401, 'Unauthorized')
        return
      }
      if (req.url !== '/mcp') {
        this.sendError(res, 404, 'Not found')
        return
      }
      if (!this.isAllowedHost(req)) {
        this.sendError(res, 403, 'Invalid Host')
        return
      }
      if (req.headers.origin) {
        this.sendError(res, 403, 'Browser Origin requests are not supported')
        return
      }
      if (!['POST', 'GET', 'DELETE'].includes(req.method || '')) {
        this.sendError(res, 405, 'Method not allowed')
        return
      }

      const sessionId = this.header(req, 'mcp-session-id')
      if (req.method === 'POST') {
        let body: unknown
        try {
          body = await this.readJsonBody(req)
        } catch (error) {
          this.sendError(res, 400, error instanceof Error ? error.message : 'Invalid JSON body')
          return
        }
        if (sessionId) {
          const existing = this.sessions.get(sessionId)
          if (!existing) {
            this.sendError(res, 404, 'MCP session not found')
            return
          }
          this.refreshSession(sessionId, existing)
          await existing.transport.handleRequest(req, res, body)
          return
        }

        if (this.sessions.size >= MAX_SESSIONS) {
          this.sendError(res, 429, 'Too many MCP sessions')
          return
        }
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() })
        const server = createMcpServer(this.facade, this.policy, { audit: this.audit, components: this.components })
        const close = async () => {
          if (transport.sessionId) {
            const current = this.sessions.get(transport.sessionId)
            this.sessions.delete(transport.sessionId)
            if (current) clearTimeout(current.idleTimer)
          }
          await server.close()
        }
        transport.onclose = () => {
          void close()
        }
        await server.connect(transport)
        await transport.handleRequest(req, res, body)
        if (transport.sessionId) {
          const session = {
            transport,
            close,
            idleTimer: setTimeout(() => {
              void close()
            }, SESSION_IDLE_MS)
          }
          this.sessions.set(transport.sessionId, session)
        }
        return
      }

      if (!sessionId) {
        this.sendError(res, 400, 'MCP session ID is required')
        return
      }
      const existing = this.sessions.get(sessionId)
      if (!existing) {
        this.sendError(res, 404, 'MCP session not found')
        return
      }
      this.refreshSession(sessionId, existing)
      await existing.transport.handleRequest(req, res)
    } catch (error) {
      if (!res.headersSent) this.sendError(res, 500, error instanceof Error ? error.message : 'Internal error')
      else res.end()
    }
  }

  private refreshSession(sessionId: string, session: McpSession): void {
    clearTimeout(session.idleTimer)
    session.idleTimer = setTimeout(() => {
      if (this.sessions.get(sessionId) === session) void session.close()
    }, SESSION_IDLE_MS)
  }

  private isAuthorized(req: IncomingMessage): boolean {
    const value = req.headers.authorization
    if (!value?.startsWith('Bearer ')) return false
    const actual = Buffer.from(value.slice('Bearer '.length), 'utf8')
    return actual.length === this.token.length && crypto.timingSafeEqual(actual, this.token)
  }

  private isAllowedHost(req: IncomingMessage): boolean {
    const host = this.header(req, 'host')
    if (!host || this.port == null) return false
    return host === `127.0.0.1:${this.port}` || host === `localhost:${this.port}`
  }

  private async readJsonBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_BODY_BYTES) throw new Error('MCP request body is too large')
      chunks.push(buffer)
    }
    if (size === 0) return undefined
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }

  private header(req: IncomingMessage, name: string): string | undefined {
    const value = req.headers[name]
    return Array.isArray(value) ? value[0] : value
  }

  private sendError(res: ServerResponse, status: number, message: string): void {
    if (res.headersSent) {
      res.end()
      return
    }
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: message }))
  }
}
