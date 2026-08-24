import {
  OperationSource,
  RuntimeEvent,
  SessionLifecycleRef,
  SessionSnapshot,
  SessionState
} from './types/RuntimeTypes'
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
  start(conn: ConnectionRecord, lifecycle: SessionLifecycleRef): Promise<object>
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
  generation: number
  finalized: boolean
  commandSettings?: SessionCommandSettings
  commandSettingsRevision: number
  createdBySource: OperationSource
  createdByPrincipalId?: string
}

export interface SessionCommandSettings {
  autoNewline: boolean
  hexMode: boolean
  crcEnabled: boolean
  crcMethod: string
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
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
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
    updatedAt: record.updatedAt,
    createdBySource: record.createdBySource,
    createdByPrincipalId: record.createdByPrincipalId
  }
}

/**
 * GUI IPC 和 AI 服务共用的连接门面。
 * 具体的 Direct/Worker/FTP 路由由注入的 backend 保留在原有 IpcConnector 中。
 */
export default class ConnectionService {
  private readonly sessions = new Map<string, SessionRecord>()
  private generation = 0
  private readonly closeListeners = new Set<(lifecycle: SessionLifecycleRef) => void>()

  constructor(
    private readonly backend: ConnectionBackend,
    private readonly eventHub: RuntimeEventHub
  ) {}

  async start(conn: ConnectionRecord, source: OperationSource = 'gui'): Promise<object> {
    const sessionId = this.normalizeSessionId(conn.sessionId)
    if (this.sessions.has(sessionId)) {
      return {
        success: false,
        code: 'SESSION_ALREADY_EXISTS',
        message: `Session already exists: ${sessionId}`
      }
    }
    const normalized: ConnectionRecord = { ...conn, sessionId }
    const now = new Date().toISOString()
    const record: SessionRecord = {
      conn: normalized,
      state: 'starting',
      updatedAt: now,
      generation: ++this.generation,
      finalized: false,
      commandSettings: this.settingsFromConnection(normalized),
      commandSettingsRevision: 0,
      createdBySource: source,
      createdByPrincipalId:
        typeof normalized.createdByPrincipalId === 'string'
          ? normalized.createdByPrincipalId
          : undefined
    }
    this.sessions.set(sessionId, record)
    this.publishState(sessionId, 'starting', source)
    const lifecycle = this.toLifecycle(record)

    try {
      const result = await this.backend.start(normalized, lifecycle)
      if (this.sessions.get(sessionId) !== record || record.finalized) {
        return {
          success: false,
          code: 'SESSION_CLOSED_DURING_START',
          message: 'Session closed while starting'
        }
      }
      if (record.state === 'stopping') {
        await this.backend.stop(normalized).catch(() => undefined)
        this.finalizeClosed(record, source)
        return {
          success: false,
          code: 'SESSION_STOPPED_DURING_START',
          message: 'Session was stopped while starting'
        }
      }
      if (isSuccessful(result)) {
        record.state = 'connected'
        record.connectedAt = new Date().toISOString()
      } else {
        record.state = 'error'
      }
      record.updatedAt = new Date().toISOString()
      this.publishState(sessionId, record.state, source, result)
      if (record.state === 'error') this.finalizeClosed(record, source, false)
      return result
    } catch (error) {
      if (record.finalized || this.sessions.get(sessionId) !== record) return toFailureResult(error)
      record.state = 'error'
      record.updatedAt = new Date().toISOString()
      const result = toFailureResult(error)
      this.publishState(sessionId, 'error', source, result)
      this.finalizeClosed(record, source, false)
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
    if (!conn) return { success: true, alreadyClosed: true }
    if (record?.finalized || record?.state === 'closed')
      return { success: true, alreadyClosed: true }
    if (record?.state === 'stopping') return { success: true, stopping: true }
    if (record) {
      record.state = 'stopping'
      record.updatedAt = new Date().toISOString()
      this.publishState(normalizedId, 'stopping', source)
    }

    try {
      const result = await this.backend.stop(conn)
      if (isSuccessful(result) && record) this.finalizeClosed(record, source)
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

  updateCommandSettings(
    sessionId: string,
    settings: SessionCommandSettings,
    revision: number,
    source: OperationSource = 'gui'
  ): { updated: boolean; revision: number } {
    const record = this.sessions.get(this.normalizeSessionId(sessionId))
    if (!record) return { updated: false, revision: 0 }
    if (!Number.isInteger(revision) || revision <= record.commandSettingsRevision) {
      return { updated: false, revision: record.commandSettingsRevision }
    }
    record.commandSettings = structuredClone(settings)
    record.commandSettingsRevision = revision
    record.updatedAt = new Date().toISOString()
    this.eventHub.publish({
      eventType: 'session.config.changed',
      sessionId: String(sessionId),
      source,
      payload: {
        changed: { commandSettings: structuredClone(settings) },
        revision,
        effectiveNow: true
      }
    })
    return { updated: true, revision }
  }

  getCommandSettings(sessionId: string): SessionCommandSettings | undefined {
    const settings = this.sessions.get(this.normalizeSessionId(sessionId))?.commandSettings
    return settings ? structuredClone(settings) : undefined
  }

  markClosed(lifecycle: SessionLifecycleRef, source: OperationSource = 'system'): boolean {
    const normalizedId = this.normalizeSessionId(lifecycle.sessionId)
    const record = this.sessions.get(normalizedId)
    if (!record || record.generation !== lifecycle.generation) return false
    return this.finalizeClosed(record, source)
  }

  getSession(sessionId: string): SessionSnapshot | undefined {
    const record = this.sessions.get(this.normalizeSessionId(sessionId))
    return record ? toSafeSnapshot(record) : undefined
  }

  getConnection(sessionId: string): ConnectionRecord | undefined {
    return this.sessions.get(this.normalizeSessionId(sessionId))?.conn
  }

  findSessionByComName(comName: string): SessionSnapshot | undefined {
    return this.findSessionByPortPath(comName)
  }

  findSessionByPortPath(portPath: string): SessionSnapshot | undefined {
    for (const record of this.sessions.values()) {
      if (record.conn.comName === portPath) return toSafeSnapshot(record)
    }
    return undefined
  }

  listSessions(): SessionSnapshot[] {
    return Array.from(this.sessions.values(), toSafeSnapshot)
  }

  getEventHub(): RuntimeEventHub {
    return this.eventHub
  }

  onSessionClosed(listener: (lifecycle: SessionLifecycleRef) => void): () => void {
    this.closeListeners.add(listener)
    return () => this.closeListeners.delete(listener)
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

  private finalizeClosed(
    record: SessionRecord,
    source: OperationSource,
    publishClosed = true
  ): boolean {
    if (record.finalized) return false
    record.finalized = true
    record.state = 'closed'
    record.updatedAt = new Date().toISOString()
    const sessionId = String(record.conn.sessionId)
    if (publishClosed) {
      this.eventHub.publish({
        eventType: 'session.closed',
        sessionId,
        source,
        payload: { state: 'closed', session: toSafeSnapshot(record) }
      })
    }
    if (this.sessions.get(sessionId) === record) this.sessions.delete(sessionId)
    for (const listener of this.closeListeners) {
      try {
        listener(this.toLifecycle(record))
      } catch {
        /* listener isolation */
      }
    }
    return true
  }

  private toLifecycle(record: SessionRecord): SessionLifecycleRef {
    return { sessionId: String(record.conn.sessionId), generation: record.generation }
  }

  private settingsFromConnection(conn: ConnectionRecord): SessionCommandSettings | undefined {
    const hasAny = ['autoNewline', 'hexMode', 'crcEnabled', 'crcMethod'].some(
      (key) => conn[key] !== undefined
    )
    if (!hasAny) return undefined
    return {
      autoNewline: conn.autoNewline !== false,
      hexMode: conn.hexMode === true,
      crcEnabled: conn.crcEnabled !== false,
      crcMethod: typeof conn.crcMethod === 'string' ? conn.crcMethod : 'CRC-16/MODBUS'
    }
  }
}
