import RuntimeEventHub from '../../../../services/RuntimeEventHub'
import type {
  RuntimeEvent,
  RuntimeEventBatch,
  RuntimeEventFilter
} from '../../../../services/types/RuntimeTypes'
import AiEventBuffer from '../../application/AiEventBuffer'
import type { EventPort } from '../../ports/EventPort'
import type { AiCommandContentMode } from '../../../../../shared/extensions/ai-control/AiConfigTypes'
import { projectCommandText, sanitizeKnownSecrets } from '../../application/AuditSanitizer'

export default class SuperConnectXEventAdapter implements EventPort {
  constructor(
    private readonly eventHub: RuntimeEventHub,
    private readonly rxBuffer: AiEventBuffer,
    private readonly getCommandContentMode: () => AiCommandContentMode = () => 'preview'
  ) {}

  read(
    afterSequence: number,
    limit: number,
    filter?: RuntimeEventFilter,
    maxBytes = 64 * 1024
  ): RuntimeEventBatch {
    const low = this.eventHub.readSince(afterSequence, Math.min(1000, limit * 2), filter, maxBytes)
    const rx = this.rxBuffer.readSince(afterSequence, Math.min(1000, limit * 2), filter, maxBytes)
    const candidates = [...low.events, ...rx.events]
      .sort((a, b) => a.sequence - b.sequence)
      .map((event) => this.projectForAi(event))
    const events = [] as typeof candidates
    let returnedBytes = 0
    for (const event of candidates) {
      const bytes = Buffer.byteLength(JSON.stringify(event), 'utf8')
      if (events.length >= Math.max(1, limit) || returnedBytes + bytes > maxBytes) break
      events.push(event)
      returnedBytes += bytes
    }
    return {
      events,
      truncated:
        low.truncated ||
        rx.truncated ||
        low.events.length + rx.events.length > events.length ||
        returnedBytes > maxBytes,
      oldestSequence: Math.min(
        low.oldestSequence || Number.MAX_SAFE_INTEGER,
        rx.oldestSequence || Number.MAX_SAFE_INTEGER
      ),
      latestSequence: Math.max(
        low.latestSequence,
        rx.latestSequence,
        this.eventHub.getLatestSequence()
      ),
      nextCursor: events.at(-1)?.sequence ?? afterSequence,
      returnedBytes,
      droppedEvents: low.droppedEvents + rx.droppedEvents,
      droppedBytes: low.droppedBytes + rx.droppedBytes
    }
  }

  async wait(
    afterSequence: number,
    filter: RuntimeEventFilter | undefined,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<RuntimeEventBatch> {
    const initial = this.read(afterSequence, 100, filter)
    if (initial.events.length || initial.oldestSequence > afterSequence + 1) return initial
    await this.rxBuffer.waitSince(afterSequence, filter, timeoutMs, signal).catch((error) => {
      if (signal?.aborted) throw error
    })
    return this.read(afterSequence, 100, filter)
  }

  latestSequence(): number {
    return this.eventHub.getLatestSequence()
  }

  private projectForAi(event: RuntimeEvent): RuntimeEvent {
    if (event.eventType !== 'tx.accepted' && event.eventType !== 'tx.failed') return event
    const mode = this.getCommandContentMode()
    const payload = sanitizeKnownSecrets(structuredClone(event.payload))
    for (const key of ['command', 'text', 'input', 'displayCommand']) {
      const projected = projectCommandText(payload[key], mode)
      if (projected === undefined) delete payload[key]
      else payload[key] = projected
    }
    return { ...event, payload }
  }
}
