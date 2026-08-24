import type { OperationSource, SessionSnapshot } from '../../../services/types/RuntimeTypes'
import type { SendEventMetadata } from '../../../services/ConnectionService'

export interface SessionStartResult extends Record<string, unknown> {
  success?: boolean
  sessionId?: string
}

export interface SessionPort {
  list(): SessionSnapshot[]
  get(sessionId: string): SessionSnapshot | undefined
  startSaved(
    connectionId: number,
    sessionId: string,
    extraFields?: Record<string, unknown>
  ): Promise<object>
  startPort(
    portPath: string,
    sessionId: string,
    extraFields?: Record<string, unknown>
  ): Promise<object>
  stop(sessionId: string, source?: OperationSource): Promise<object>
  send(
    sessionId: string,
    command: string,
    source: OperationSource,
    metadata?: SendEventMetadata
  ): Promise<object>
}
