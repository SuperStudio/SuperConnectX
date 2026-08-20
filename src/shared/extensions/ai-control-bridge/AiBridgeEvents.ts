/** renderer 使用的 AI 活动事件最小类型，不与主进程内部事件实现耦合。 */
export type AiActivityAction = 'read' | 'control'
export type AiActivityStatus = 'success' | 'failed'

export interface AiBridgeEventPayload extends Record<string, unknown> {
  method?: string
  action?: AiActivityAction
  status?: AiActivityStatus
  details?: Record<string, unknown>
  errorCode?: string
}

export interface AiBridgeEvent {
  eventId?: string
  sequence?: number
  timestamp?: string
  eventType?: string
  source?: string
  sessionId?: string
  payload?: AiBridgeEventPayload
}

/** 设置页使用的 AI 客户端在线状态，不包含 token、Pipe 等认证材料。 */
export interface AiBridgeClientStatus {
  connected: boolean
  clientCount: number
  clientNames: string[]
}
