import type { AiActivityEntry } from '../../../../shared/extensions/ai-control/AiActivityTypes'

export interface AuditPort {
  record(entry: Omit<AiActivityEntry, 'id' | 'timestamp'>): void
  read(limit: number): Promise<AiActivityEntry[]>
  clear(): Promise<void>
}
