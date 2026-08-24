/** 标记运行时操作来源，供界面展示、审计和订阅过滤使用。 */
export type OperationSource = 'gui' | 'ai' | 'system'

/** 主进程内部连接生命周期标识；不进入 Renderer、MCP 或持久化配置。 */
export interface SessionLifecycleRef {
  sessionId: string
  generation: number
}

export type RuntimeEventType =
  | 'session.state'
  | 'session.closed'
  | 'session.config.changed'
  | 'rx.display'
  | 'tx.accepted'
  | 'tx.failed'
  | 'config.changed'
  | 'ai.client.changed'
  | 'ai.activity'

export interface RuntimeEventInput {
  eventType: RuntimeEventType
  sessionId?: string
  source: OperationSource
  payload: Record<string, unknown>
  timestamp?: string
}

export interface RuntimeEvent extends RuntimeEventInput {
  eventId: string
  sequence: number
  timestamp: string
}

export interface RuntimeEventFilter {
  eventTypes?: RuntimeEventType[]
  sessionIds?: string[]
}

export interface RuntimeEventBatch {
  events: RuntimeEvent[]
  truncated: boolean
  oldestSequence: number
  latestSequence: number
  nextCursor: number
  returnedBytes: number
  droppedEvents: number
  droppedBytes: number
}

export type SessionState = 'starting' | 'connected' | 'stopping' | 'error' | 'closed' | 'unknown'

/** 主进程维护的连接会话快照；密码等敏感字段不得进入 `desiredConfig`。 */
export interface SessionSnapshot {
  sessionId: string
  state: SessionState
  connectionType?: string
  name?: string
  comName?: string
  host?: string
  port?: number
  desiredConfig: Record<string, unknown>
  connectedAt?: string
  updatedAt: string
  createdBySource?: OperationSource
  createdByPrincipalId?: string
}

export interface ConfigFieldMeta {
  path: string
  type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object'
  enum?: Array<string | number>
  min?: number
  max?: number
  readable: boolean
  writable: boolean
  secret: boolean
  applyMode: 'immediate' | 'reconnect' | 'restart' | 'task'
  aliases?: string[]
}

export interface ConfigDomainSchema {
  domain: string
  targetRequired: boolean
  fields: ConfigFieldMeta[]
}

export interface ConfigSnapshot {
  domain: string
  targetId: string | null
  value: Record<string, unknown> | null
  revision: number
}

export interface ConfigPatchRequest {
  domain: string
  targetId?: string | null
  patch: Record<string, unknown>
  expectedRevision?: number
  source: OperationSource
}

export interface ConfigApplyResult {
  effectiveNow?: boolean
  requiresReconnect?: boolean
  requiresRestart?: boolean
  message?: string
}

export interface ConfigPatchResult {
  success: true
  snapshot: ConfigSnapshot
  changed: Record<string, unknown>
  effectiveNow: boolean
  requiresReconnect: boolean
  requiresRestart: boolean
  source: OperationSource
}
