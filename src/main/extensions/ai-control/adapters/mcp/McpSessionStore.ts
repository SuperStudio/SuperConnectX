import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { AiClientInfo } from '../../../../../shared/extensions/ai-control/AiServiceTypes'

export interface RegisteredToolHandle {
  enable(): void
  disable(): void
}

export interface McpSessionRecord {
  sessionId: string
  principalId: string
  server: McpServer
  transport: StreamableHTTPServerTransport
  clientInfo: AiClientInfo
  handles: Map<string, RegisteredToolHandle>
  controllers: Set<AbortController>
  concurrentRequests: number
  lastActivityAt: number
  tokens: number
  lastRefillAt: number
  closing: boolean
  connectedAnnounced: boolean
}

export default class McpSessionStore {
  private readonly sessions = new Map<string, McpSessionRecord>()

  constructor(private readonly maxSessions = 32) {}

  canCreate(): boolean {
    return this.sessions.size < this.maxSessions
  }

  add(record: McpSessionRecord): void {
    if (!this.canCreate()) throw new Error('SERVER_BUSY')
    this.sessions.set(record.sessionId, record)
  }

  get(sessionId: string): McpSessionRecord | undefined {
    return this.sessions.get(sessionId)
  }

  list(): McpSessionRecord[] {
    return [...this.sessions.values()]
  }

  clients(): AiClientInfo[] {
    return this.list()
      .filter(
        (record) =>
          record.connectedAnnounced && record.clientInfo.name !== 'superconnectx-self-test'
      )
      .map((record) => ({
        ...record.clientInfo,
        lastActivityAt: new Date(record.lastActivityAt).toISOString()
      }))
  }

  delete(sessionId: string): McpSessionRecord | undefined {
    const record = this.sessions.get(sessionId)
    this.sessions.delete(sessionId)
    return record
  }

  touch(sessionId: string): void {
    const record = this.sessions.get(sessionId)
    if (record) record.lastActivityAt = Date.now()
  }

  expired(now: number, idleMs: number): McpSessionRecord[] {
    return this.list().filter((record) => now - record.lastActivityAt >= idleMs)
  }

  clear(): void {
    this.sessions.clear()
  }
}
