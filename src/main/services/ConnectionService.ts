import { OperationSource, RuntimeEvent, SessionSnapshot, SessionState } from './types/RuntimeTypes'
import RuntimeEventHub from './RuntimeEventHub'

export interface ConnectionRecord {
  sessionId: string
  connectionType?: string
  name?: string
  remark?: string
  comName?: string
  host?: string
  port?: number
  [key: string]: unknown
}

export interface ConnectionBackend {
  start(conn: ConnectionRecord): Promise<object>
  send(conn: ConnectionRecord, command: string): Promise<object>
  stop(conn: ConnectionRecord): Promise<object>
  update(conn: ConnectionRecord, config: Record<string, unknown>): Promise<object>
}

export interface SendEventMetadata {
  input?: string
  displayCommand?: string
  preparedBySoftware?: boolean
}

interface SessionRecord {
  conn: ConnectionRecord
  state: SessionState
  connectedAt?: string
  updatedAt: string
}

interface FailureResult {
  success: false
  message: string
  code?: string
}

function isSuccessful(result: object | null | undefined): boolean {
  return (result as { success?: boolean } | null | undefined)?.success !== false
}

/** 将 backend 异常转换为可跨 IPC 返回的失败结果，并保留调用方需要识别的系统错误码。 */
function toFailureResult(error: unknown): FailureResult {
  const result: FailureResult = {
    success: false,
    message: error instanceof Error ? error.message : String(error)
  }
  const code =
    error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
  if (typeof code === 'string' && code) result.code = code
  return result
}

function toSafeSnapshot(record: SessionRecord): SessionSnapshot {
  const conn = record.conn
  const desiredConfig: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(conn)) {
    if (key === 'password' || key === 'token') continue
    if (
      key === 'sessionId' ||
      key === 'name' ||
      key === 'connectionType' ||
      key === 'comName' ||
      key === 'host' ||
      key === 'port'
    )
      continue
    if (value !== undefined) desiredConfig[key] = value
  }

  return {
    sessionId: String(conn.sessionId),
    state: record.state,
    connectionType: typeof conn.connectionType === 'string' ? conn.connectionType : undefined,
    name: typeof conn.name === 'string' ? conn.name : undefined,
    comName: typeof conn.comName === 'string' && conn.comName ? conn.comName : undefined,
    host: typeof conn.host === 'string' && conn.host ? conn.host : undefined,
    port: typeof conn.port === 'number' ? conn.port : undefined,
    desiredConfig,
    connectedAt: record.connectedAt,
    updatedAt: record.updatedAt
  }
}

/**
 * GUI IPC 和 AI Bridge 共用的连接门面。
 * 具体的 Direct/Worker/FTP 路由由注入的 backend 保留在原有 IpcConnector 中。
 */
export default class ConnectionService {
  private readonly sessions = new Map<string, SessionRecord>()

  constructor(
    private readonly backend: ConnectionBackend,
    private readonly eventHub: RuntimeEventHub
  ) {}

  async start(conn: ConnectionRecord, source: OperationSource = 'gui'): Promise<object> {
    const sessionId = this.normalizeSessionId(conn.sessionId)
    const normalized = { ...conn, sessionId }
    const now = new Date().toISOString()
    const record: SessionRecord = { conn: normalized, state: 'starting', updatedAt: now }
    this.sessions.set(sessionId, record)
    this.publishState(sessionId, 'starting', source)

    try {
      const result = await this.backend.start(normalized)
      if (isSuccessful(result)) {
        record.state = 'connected'
        record.connectedAt = new Date().toISOString()
      } else {
        record.state = 'error'
      }
      record.updatedAt = new Date().toISOString()
      this.publishState(sessionId, record.state, source, result)
      if (record.state === 'error') this.sessions.delete(sessionId)
      return result
    } catch (error) {
      record.state = 'error'
      record.updatedAt = new Date().toISOString()
      const result = toFailureResult(error)
      this.publishState(sessionId, 'error', source, result)
      this.sessions.delete(sessionId)
      return result
    }
  }

  async send(
    sessionId: string,
    command: string,
    source: OperationSource = 'gui',
    fallbackConn?: ConnectionRecord,
    metadata?: SendEventMetadata
  ): Promise<object> {
    const normalizedId = this.normalizeSessionId(sessionId)
    const record = this.sessions.get(normalizedId)
    const conn =
      record?.conn || (fallbackConn ? { ...fallbackConn, sessionId: normalizedId } : null)
    if (!conn) return { success: false, message: 'Session does not exist' }

    try {
      const result = await this.backend.send(conn, command)
      const eventType = isSuccessful(result) ? 'tx.accepted' : 'tx.failed'
      this.eventHub.publish({
        eventType,
        sessionId: normalizedId,
        source,
        payload: {
          command,
          byteLength: Buffer.byteLength(command, 'utf8'),
          text: command,
          ...metadata,
          result
        }
      })
      return result
    } catch (error) {
      const result = toFailureResult(error)
      this.eventHub.publish({
        eventType: 'tx.failed',
        sessionId: normalizedId,
        source,
        payload: { command, result }
      })
      return result
    }
  }

  async stop(
    sessionId: string,
    source: OperationSource = 'gui',
    fallbackConn?: ConnectionRecord
  ): Promise<object> {
    const normalizedId = this.normalizeSessionId(sessionId)
    const record = this.sessions.get(normalizedId)
    const conn =
      record?.conn || (fallbackConn ? { ...fallbackConn, sessionId: normalizedId } : null)
    if (!conn) return { success: true }

    try {
      const result = await this.backend.stop(conn)
      if (isSuccessful(result)) this.markClosed(normalizedId, source)
      return result
    } catch (error) {
      return toFailureResult(error)
    }
  }

  async update(
    sessionId: string,
    config: Record<string, unknown>,
    source: OperationSource = 'gui',
    fallbackConn?: ConnectionRecord
  ): Promise<object> {
    const normalizedId = this.normalizeSessionId(sessionId)
    const record = this.sessions.get(normalizedId)
    const conn =
      record?.conn || (fallbackConn ? { ...fallbackConn, sessionId: normalizedId } : null)
    if (!conn) return { success: false, message: 'Session does not exist' }

    const result = await this.backend.update(conn, config)
    if (isSuccessful(result)) {
      if (record) {
        Object.assign(record.conn, config)
        record.updatedAt = new Date().toISOString()
      }
      this.eventHub.publish({
        eventType: 'session.config.changed',
        sessionId: normalizedId,
        source,
        payload: { changed: { ...config }, result }
      })
    }
    return result
  }

  recordConfig(
    sessionId: string,
    config: Record<string, unknown>,
    source: OperationSource = 'gui'
  ): void {
    const record = this.sessions.get(this.normalizeSessionId(sessionId))
    if (!record) return
    Object.assign(record.conn, config)
    record.updatedAt = new Date().toISOString()
    this.eventHub.publish({
      eventType: 'session.config.changed',
      sessionId: String(sessionId),
      source,
      payload: { changed: { ...config }, effectiveNow: true }
    })
  }

  markClosed(sessionId: string, source: OperationSource = 'system'): void {
    const normalizedId = this.normalizeSessionId(sessionId)
    const record = this.sessions.get(normalizedId)
    if (!record) return
    record.state = 'closed'
    record.updatedAt = new Date().toISOString()
    this.eventHub.publish({
      eventType: 'session.closed',
      sessionId: normalizedId,
      source,
      payload: { state: 'closed', session: toSafeSnapshot(record) }
    })
    this.sessions.delete(normalizedId)
  }

  getSession(sessionId: string): SessionSnapshot | undefined {
    const record = this.sessions.get(this.normalizeSessionId(sessionId))
    return record ? toSafeSnapshot(record) : undefined
  }

  getConnection(sessionId: string): ConnectionRecord | undefined {
    return this.sessions.get(this.normalizeSessionId(sessionId))?.conn
  }

  findSessionByComName(comName: string): SessionSnapshot | undefined {
    for (const record of this.sessions.values()) {
      if (record.conn.comName === comName) return toSafeSnapshot(record)
    }
    return undefined
  }

  listSessions(): SessionSnapshot[] {
    return Array.from(this.sessions.values(), toSafeSnapshot)
  }

  getEventHub(): RuntimeEventHub {
    return this.eventHub
  }

  private publishState(
    sessionId: string,
    state: SessionState,
    source: OperationSource,
    result?: object
  ): RuntimeEvent {
    const record = this.sessions.get(sessionId)
    return this.eventHub.publish({
      eventType: 'session.state',
      sessionId,
      source,
      payload: {
        state,
        result: result || null,
        ...(record ? { session: toSafeSnapshot(record) } : {})
      }
    })
  }

  private normalizeSessionId(sessionId: string | number): string {
    const normalized = String(sessionId ?? '')
    if (!normalized) throw new Error('sessionId cannot be empty')
    return normalized
  }
}
