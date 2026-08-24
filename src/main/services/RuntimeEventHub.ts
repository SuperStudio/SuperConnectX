import {
  RuntimeEvent,
  RuntimeEventBatch,
  RuntimeEventFilter,
  RuntimeEventInput
} from './types/RuntimeTypes'

type EventListener = (event: RuntimeEvent) => void

interface Subscription {
  filter?: RuntimeEventFilter
  listener: EventListener
}

interface RetainedEvent {
  event: RuntimeEvent
  bytes: number
}

const DEFAULT_EVENT_CAPACITY = 512
const DEFAULT_TOTAL_BYTES = 8 * 1024 * 1024
const DEFAULT_RX_SESSION_BYTES = 2 * 1024 * 1024
const DEFAULT_BATCH_BYTES = 64 * 1024
const MAX_BATCH_BYTES = 128 * 1024

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return ''
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value

  let low = 0
  let high = value.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (Buffer.byteLength(value.slice(0, middle), 'utf8') <= maxBytes) low = middle
    else high = middle - 1
  }
  return value.slice(0, low)
}

/**
 * 主进程内的有界运行时事件源。
 * RX 仅在 AI 已绑定会话或显式订阅时采集，并同时受事件数、全局字节数和单会话字节数限制。
 */
export default class RuntimeEventHub {
  private sequence = 0
  private readonly events: RetainedEvent[] = []
  private retainedBytes = 0
  private readonly rxSessionBytes = new Map<string, number>()
  private droppedEvents = 0
  private droppedBytes = 0
  private nextSubscriptionId = 1
  private readonly subscriptions = new Map<string, Subscription>()
  private readonly rxCaptureCounts = new Map<string, number>()
  private rxRetentionGate: () => boolean = () => true
  private rxSink?: EventListener

  constructor(
    private readonly capacity: number = DEFAULT_EVENT_CAPACITY,
    private readonly maxBytes: number = DEFAULT_TOTAL_BYTES,
    private readonly maxRxBytesPerSession: number = DEFAULT_RX_SESSION_BYTES
  ) {
    if (!Number.isInteger(capacity) || capacity < 16) {
      throw new Error('RuntimeEventHub capacity must be an integer >= 16')
    }
    if (maxBytes < 64 * 1024 || maxRxBytesPerSession < 16 * 1024) {
      throw new Error('RuntimeEventHub byte limits are too small')
    }
  }

  setRxRetentionGate(gate: () => boolean): void {
    this.rxRetentionGate = gate
  }

  setRxSink(sink?: EventListener): void {
    this.rxSink = sink
  }

  /** 仅 AI 会话绑定或显式 RX 订阅持有采集引用；释放最后一个引用后不再缓存该会话。 */
  acquireRxCapture(sessionIds: string[]): () => void {
    const normalized = Array.from(new Set(sessionIds.map(String).filter(Boolean)))
    for (const sessionId of normalized) {
      this.rxCaptureCounts.set(sessionId, (this.rxCaptureCounts.get(sessionId) || 0) + 1)
    }

    let released = false
    return () => {
      if (released) return
      released = true
      for (const sessionId of normalized) {
        const next = (this.rxCaptureCounts.get(sessionId) || 0) - 1
        if (next > 0) this.rxCaptureCounts.set(sessionId, next)
        else {
          this.rxCaptureCounts.delete(sessionId)
          this.clearRetainedRx(sessionId)
        }
      }
    }
  }

  shouldCaptureRx(sessionId: string): boolean {
    return Boolean(sessionId) && this.rxRetentionGate() && Boolean(this.rxSink)
  }

  publishRx(input: RuntimeEventInput): RuntimeEvent {
    const event = this.createEvent(input)
    if (this.shouldCaptureRx(event.sessionId || '')) this.rxSink?.(event)
    return event
  }

  publish(input: RuntimeEventInput): RuntimeEvent {
    const event = this.createEvent(input)

    if (event.eventType !== 'rx.display' || this.shouldCaptureRx(event.sessionId || '')) {
      this.retain(event)
    }

    for (const subscription of this.subscriptions.values()) {
      if (!this.matches(event, subscription.filter)) continue
      try {
        subscription.listener(event)
      } catch {
        // 单个订阅者故障不能影响串口事件生产者或其他订阅者。
      }
    }

    return event
  }

  subscribe(listener: EventListener, filter?: RuntimeEventFilter): () => void {
    const id = String(this.nextSubscriptionId++)
    this.subscriptions.set(id, { listener, filter })
    return () => {
      this.subscriptions.delete(id)
    }
  }

  readSince(
    afterSequence: number = 0,
    limit: number = 100,
    filter?: RuntimeEventFilter,
    maxBytes: number = DEFAULT_BATCH_BYTES
  ): RuntimeEventBatch {
    const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)))
    const safeMaxBytes = Math.max(1024, Math.min(MAX_BATCH_BYTES, Math.trunc(maxBytes)))
    const oldestSequence = this.events[0]?.event.sequence ?? this.sequence + 1
    const candidates = this.events
      .map((item) => item.event)
      .filter((event) => event.sequence > afterSequence && this.matches(event, filter))

    const events: RuntimeEvent[] = []
    let returnedBytes = 0
    let byteTruncated = false
    for (const candidate of candidates) {
      if (events.length >= safeLimit) break
      const remaining = safeMaxBytes - returnedBytes
      if (remaining <= 0) {
        byteTruncated = true
        break
      }

      const fitted = this.fitEvent(candidate, remaining)
      if (!fitted) {
        byteTruncated = true
        break
      }
      events.push(fitted.event)
      returnedBytes += fitted.bytes
      byteTruncated = byteTruncated || fitted.truncated
      if (fitted.truncated) break
    }

    const consumedAll = events.length >= candidates.length && !byteTruncated
    const nextCursor = consumedAll
      ? this.sequence
      : events.at(-1)?.sequence || Math.max(0, afterSequence)

    return {
      events,
      truncated:
        afterSequence < oldestSequence - 1 ||
        !consumedAll ||
        candidates.length > safeLimit ||
        byteTruncated,
      oldestSequence,
      latestSequence: this.sequence,
      nextCursor,
      returnedBytes,
      droppedEvents: this.droppedEvents,
      droppedBytes: this.droppedBytes
    }
  }

  getLatestSequence(): number {
    return this.sequence
  }

  clear(): void {
    this.events.length = 0
    this.retainedBytes = 0
    this.rxSessionBytes.clear()
    this.rxCaptureCounts.clear()
    this.subscriptions.clear()
    this.droppedEvents = 0
    this.droppedBytes = 0
    this.rxSink = undefined
  }

  /** 释放桥梁已缓存的 RX；不影响 GUI 日志、串口接收链路和非 RX 状态事件。 */
  clearRetainedRx(sessionId?: string): void {
    for (let index = this.events.length - 1; index >= 0; index--) {
      const item = this.events[index]
      if (item.event.eventType !== 'rx.display') continue
      if (sessionId && item.event.sessionId !== sessionId) continue
      this.removeRetained(index, false)
    }
  }

  private retain(event: RuntimeEvent): void {
    const bytes = serializedBytes(event)
    const sessionId = event.eventType === 'rx.display' ? event.sessionId : undefined
    if (bytes > this.maxBytes || (sessionId && bytes > this.maxRxBytesPerSession)) {
      this.recordDrop(bytes)
      return
    }

    this.events.push({ event, bytes })
    this.retainedBytes += bytes
    if (sessionId) {
      this.rxSessionBytes.set(sessionId, (this.rxSessionBytes.get(sessionId) || 0) + bytes)
    }

    while (
      this.events.length > this.capacity ||
      this.retainedBytes > this.maxBytes ||
      (sessionId && (this.rxSessionBytes.get(sessionId) || 0) > this.maxRxBytesPerSession)
    ) {
      const index =
        sessionId && (this.rxSessionBytes.get(sessionId) || 0) > this.maxRxBytesPerSession
          ? this.events.findIndex((item) => item.event.sessionId === sessionId)
          : 0
      this.evict(index >= 0 ? index : 0)
    }
  }

  private evict(index: number): void {
    this.removeRetained(index, true)
  }

  private removeRetained(index: number, countAsDropped: boolean): void {
    const [removed] = this.events.splice(index, 1)
    if (!removed) return
    this.retainedBytes -= removed.bytes
    if (removed.event.eventType === 'rx.display' && removed.event.sessionId) {
      const sessionId = removed.event.sessionId
      const next = Math.max(0, (this.rxSessionBytes.get(sessionId) || 0) - removed.bytes)
      if (next > 0) this.rxSessionBytes.set(sessionId, next)
      else this.rxSessionBytes.delete(sessionId)
    }
    if (countAsDropped) this.recordDrop(removed.bytes)
  }

  private recordDrop(bytes: number): void {
    this.droppedEvents += 1
    this.droppedBytes += bytes
  }

  private fitEvent(
    event: RuntimeEvent,
    maxBytes: number
  ): { event: RuntimeEvent; bytes: number; truncated: boolean } | null {
    const bytes = serializedBytes(event)
    if (bytes <= maxBytes) return { event, bytes, truncated: false }
    if (event.eventType !== 'rx.display' || typeof event.payload.data !== 'string') return null

    const originalData = event.payload.data
    const overheadEvent: RuntimeEvent = {
      ...event,
      payload: {
        ...event.payload,
        data: '',
        dataTruncated: true,
        originalByteLength: Buffer.byteLength(originalData, 'utf8')
      }
    }
    const overhead = serializedBytes(overheadEvent)
    if (overhead >= maxBytes) return null
    const fittedEvent: RuntimeEvent = {
      ...overheadEvent,
      payload: {
        ...overheadEvent.payload,
        data: truncateUtf8(originalData, maxBytes - overhead)
      }
    }
    return { event: fittedEvent, bytes: serializedBytes(fittedEvent), truncated: true }
  }

  private matches(event: RuntimeEvent, filter?: RuntimeEventFilter): boolean {
    if (!filter) return true
    if (filter.eventTypes && !filter.eventTypes.includes(event.eventType)) return false
    if (filter.sessionIds && (!event.sessionId || !filter.sessionIds.includes(event.sessionId))) {
      return false
    }
    return true
  }

  private createEvent(input: RuntimeEventInput): RuntimeEvent {
    return {
      ...input,
      eventId: `${process.pid}-${this.sequence + 1}`,
      sequence: ++this.sequence,
      timestamp: input.timestamp || new Date().toISOString()
    }
  }
}
