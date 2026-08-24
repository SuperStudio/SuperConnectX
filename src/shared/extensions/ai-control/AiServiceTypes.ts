import type { AiConfigDocument, AiPermission } from './AiConfigTypes'

export type McpServiceState =
  'disabled' | 'starting' | 'running' | 'stopping' | 'port_conflict' | 'error'

export interface AiClientInfo {
  sessionId: string
  name: string
  version?: string
  connectedAt: string
  lastActivityAt: string
}

export interface AiServiceStatus {
  state: McpServiceState
  /** 仅在当前进程内有效；每次软件启动固定恢复为只读。 */
  permission: AiPermission
  instanceIndex: number
  instanceAlias: string
  endpoint: string
  port: number
  clientCount: number
  clients: AiClientInfo[]
  lastError?: string
  configRevision: number
  tokenFingerprint: string
}

export interface AiSelfTestResult {
  success: boolean
  message: string
  toolCount?: number
  durationMs: number
}

export interface AiServiceViewConfig {
  config: AiConfigDocument
  instanceIndex: number
}

export interface RuntimeUiEvent {
  eventId?: string
  sequence?: number
  timestamp?: string
  eventType?: string
  source?: string
  sessionId?: string
  payload?: Record<string, unknown>
}
