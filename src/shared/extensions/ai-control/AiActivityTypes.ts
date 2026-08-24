export type AiActivityAction = 'read' | 'control'
export type AiActivityStatus = 'success' | 'failed'

export interface AiActivityEntry {
  id: string
  timestamp: string
  operation: string
  action: AiActivityAction
  status: AiActivityStatus
  principalId?: string
  clientName?: string
  sessionId?: string
  errorCode?: string
  details?: Record<string, unknown>
}
