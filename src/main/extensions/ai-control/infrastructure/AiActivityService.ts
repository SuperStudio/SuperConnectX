import { randomUUID } from 'crypto'
import type { AiActivityEntry } from '../../../../shared/extensions/ai-control/AiActivityTypes'
import type { AiCommandContentMode } from '../../../../shared/extensions/ai-control/AiConfigTypes'
import RuntimeEventHub from '../../../services/RuntimeEventHub'
import type { RuntimeEvent } from '../../../services/types/RuntimeTypes'
import type { AuditPort } from '../ports/AuditPort'
import AiActivityLog, { type AiActivityLogInfo } from './AiActivityLog'
import { sanitizeAuditDetails } from '../application/AuditSanitizer'

export default class AiActivityService implements AuditPort {
  private release?: () => void

  constructor(
    private readonly eventHub: RuntimeEventHub,
    private readonly log: AiActivityLog,
    private readonly getMode: () => AiCommandContentMode
  ) {}

  start(): void {
    if (this.release) return
    this.release = this.eventHub.subscribe((event) => this.log.record(event), {
      eventTypes: ['ai.activity']
    })
  }

  record(entry: Omit<AiActivityEntry, 'id' | 'timestamp'>): void {
    const details = sanitizeAuditDetails(entry.details, this.getMode())
    this.eventHub.publish({
      eventType: 'ai.activity',
      source: 'ai',
      sessionId: entry.sessionId,
      payload: {
        method: entry.operation,
        action: entry.action,
        status: entry.status,
        principalId: entry.principalId,
        clientName: entry.clientName,
        ...(entry.errorCode ? { errorCode: entry.errorCode } : {}),
        ...(details ? { details } : {})
      }
    })
  }

  async read(limit: number): Promise<AiActivityEntry[]> {
    const events = await this.log.readHistory(limit)
    return events.map((event) => this.toEntry(event))
  }

  clear(): Promise<void> {
    return this.log.clearHistory()
  }

  getInfo(): AiActivityLogInfo {
    return this.log.getInfo()
  }

  openDirectory(): Promise<{ success: boolean; message?: string }> {
    return this.log.openDirectory()
  }

  configure(options: Parameters<AiActivityLog['configure']>[0]): void {
    this.log.configure(options)
  }

  async dispose(): Promise<void> {
    this.release?.()
    this.release = undefined
    await this.log.flush()
  }

  private toEntry(event: RuntimeEvent): AiActivityEntry {
    const payload = event.payload || {}
    return {
      id: event.eventId || randomUUID(),
      timestamp: event.timestamp,
      operation: typeof payload.method === 'string' ? payload.method : 'unknown',
      action: payload.action === 'read' ? 'read' : 'control',
      status: payload.status === 'failed' ? 'failed' : 'success',
      sessionId: event.sessionId,
      principalId: typeof payload.principalId === 'string' ? payload.principalId : undefined,
      clientName: typeof payload.clientName === 'string' ? payload.clientName : undefined,
      errorCode: typeof payload.errorCode === 'string' ? payload.errorCode : undefined,
      details:
        payload.details && typeof payload.details === 'object'
          ? (payload.details as Record<string, unknown>)
          : undefined
    }
  }
}
