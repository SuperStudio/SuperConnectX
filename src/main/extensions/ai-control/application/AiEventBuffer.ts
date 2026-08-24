import type {
  RuntimeEvent,
  RuntimeEventBatch,
  RuntimeEventFilter
} from '../../../services/types/RuntimeTypes'

interface BufferedEntry {
  event: RuntimeEvent
  bytes: number
  estimatedBytes: number
  active: boolean
}

interface Waiter {
  filter?: RuntimeEventFilter
  afterSequence: number
  resolve: (batch: RuntimeEventBatch) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
  signal?: AbortSignal
  abort?: () => void
}

const byteLength = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8')

export default class AiEventBuffer {
  private pending: BufferedEntry[] = []
  private pendingHead = 0
  private pendingBytes = 0
  private retained: BufferedEntry[] = []
  private retainedHead = 0
  private retainedBytes = 0
  private activeEvents = 0
  private readonly sessionEntries = new Map<string, BufferedEntry[]>()
  private readonly sessionHeads = new Map<string, number>()
  private readonly sessionBytes = new Map<string, number>()
  private readonly waiters = new Set<Waiter>()
  private flushScheduled = false
  private droppedEvents = 0
  private droppedBytes = 0

  constructor(
    private readonly maxEvents = 512,
    private readonly maxBytes = 8 * 1024 * 1024,
    private readonly maxSessionBytes = 2 * 1024 * 1024
  ) {}

  enqueueRx(event: RuntimeEvent): void {
    // RX 回调只执行常数时间估算和数组尾部入队；精确复制、序列化与 retain 在异步 flush 中完成。
    const estimatedBytes = this.estimatePendingBytes(event)
    const entry = { event, bytes: 0, estimatedBytes, active: true }
    this.pending.push(entry)
    this.pendingBytes += estimatedBytes
    while (this.pending.length - this.pendingHead > 256 || this.pendingBytes > 512 * 1024) {
      const removed = this.pending[this.pendingHead++]
      if (!removed) break
      this.pendingBytes -= removed.estimatedBytes
      this.droppedEvents += 1
      this.droppedBytes += removed.estimatedBytes
    }
    this.scheduleFlush()
  }

  readSince(
    afterSequence = 0,
    limit = 100,
    filter?: RuntimeEventFilter,
    maxBytes = 64 * 1024
  ): RuntimeEventBatch {
    const events: RuntimeEvent[] = []
    let returnedBytes = 0
    let truncated = false
    const active = this.retained.filter(
      (entry, index) => index >= this.retainedHead && entry.active
    )
    const oldestSequence = active[0]?.event.sequence ?? 0
    const latestSequence = active.at(-1)?.event.sequence ?? afterSequence
    for (const entry of active) {
      if (entry.event.sequence <= afterSequence || !this.matches(entry.event, filter)) continue
      if (
        events.length >= Math.max(1, Math.min(limit, 1000)) ||
        returnedBytes + entry.bytes > maxBytes
      ) {
        truncated = true
        break
      }
      events.push(structuredClone(entry.event))
      returnedBytes += entry.bytes
    }
    return {
      events,
      truncated,
      oldestSequence,
      latestSequence,
      nextCursor: events.at(-1)?.sequence ?? afterSequence,
      returnedBytes,
      droppedEvents: this.droppedEvents,
      droppedBytes: this.droppedBytes
    }
  }

  waitSince(
    afterSequence: number,
    filter: RuntimeEventFilter | undefined,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<RuntimeEventBatch> {
    const sessionId = filter?.sessionIds?.length === 1 ? filter.sessionIds[0] : undefined
    if (
      this.waiters.size >= 128 ||
      (sessionId &&
        [...this.waiters].filter((waiter) => waiter.filter?.sessionIds?.includes(sessionId))
          .length >= 32)
    ) {
      return Promise.reject(new Error('RESOURCE_LIMIT'))
    }
    const immediate = this.readSince(afterSequence, 100, filter)
    if (immediate.events.length > 0 || immediate.oldestSequence > afterSequence + 1)
      return Promise.resolve(immediate)
    return new Promise((resolve, reject) => {
      const waiter = {} as Waiter
      waiter.filter = filter
      waiter.afterSequence = afterSequence
      waiter.resolve = resolve
      waiter.reject = reject
      waiter.timer = setTimeout(
        () => {
          this.removeWaiter(waiter)
          resolve(this.readSince(afterSequence, 100, filter))
        },
        Math.max(1, Math.min(timeoutMs, 30_000))
      )
      if (signal) {
        waiter.signal = signal
        waiter.abort = () => {
          this.removeWaiter(waiter)
          reject(new Error('REQUEST_CANCELLED'))
        }
        signal.addEventListener('abort', waiter.abort, { once: true })
      }
      this.waiters.add(waiter)
    })
  }

  clearSession(sessionId: string): void {
    for (const entry of this.sessionEntries.get(sessionId) || []) this.deactivate(entry, false)
    this.sessionEntries.delete(sessionId)
    this.sessionHeads.delete(sessionId)
    this.sessionBytes.delete(sessionId)
  }

  dispose(): void {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer)
      waiter.signal?.removeEventListener('abort', waiter.abort!)
      waiter.reject(new Error('EVENT_BUFFER_STOPPED'))
    }
    this.waiters.clear()
    this.pending = []
    this.pendingHead = 0
    this.pendingBytes = 0
    this.retained = []
    this.activeEvents = 0
    this.sessionEntries.clear()
    this.sessionHeads.clear()
    this.sessionBytes.clear()
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) return
    this.flushScheduled = true
    setImmediate(() => this.flush())
  }

  private flush(): void {
    this.flushScheduled = false
    let count = 0
    let bytes = 0
    while (this.pendingHead < this.pending.length && count < 64 && bytes < 256 * 1024) {
      const entry = this.pending[this.pendingHead++]
      if (!entry) break
      this.pendingBytes -= entry.estimatedBytes
      entry.event = {
        ...entry.event,
        payload: structuredClone(entry.event.payload)
      }
      entry.bytes = byteLength(entry.event)
      this.retain(entry)
      count += 1
      bytes += entry.estimatedBytes
    }
    if (this.pendingHead >= this.pending.length) {
      this.pending = []
      this.pendingHead = 0
      this.pendingBytes = 0
    } else {
      this.scheduleFlush()
    }
    this.resolveWaiters()
    if (this.retainedHead > this.retained.length / 2) {
      this.retained = this.retained.slice(this.retainedHead)
      this.retainedHead = 0
    }
  }

  private retain(entry: BufferedEntry): void {
    this.retained.push(entry)
    this.retainedBytes += entry.bytes
    this.activeEvents += 1
    const sessionId = entry.event.sessionId
    if (sessionId) {
      const entries = this.sessionEntries.get(sessionId) || []
      entries.push(entry)
      this.sessionEntries.set(sessionId, entries)
      this.sessionBytes.set(sessionId, (this.sessionBytes.get(sessionId) || 0) + entry.bytes)
      this.evictSession(sessionId)
    }
    while (this.activeEvents > this.maxEvents || this.retainedBytes > this.maxBytes) {
      const oldest = this.nextActiveGlobal()
      if (!oldest) break
      this.deactivate(oldest, true)
    }
  }

  private evictSession(sessionId: string): void {
    const entries = this.sessionEntries.get(sessionId) || []
    let head = this.sessionHeads.get(sessionId) || 0
    while (
      (this.sessionBytes.get(sessionId) || 0) > this.maxSessionBytes &&
      head < entries.length
    ) {
      const entry = entries[head++]
      if (entry?.active) this.deactivate(entry, true)
    }
    this.sessionHeads.set(sessionId, head)
    if (head > entries.length / 2) {
      this.sessionEntries.set(sessionId, entries.slice(head))
      this.sessionHeads.set(sessionId, 0)
    }
  }

  private nextActiveGlobal(): BufferedEntry | undefined {
    while (this.retainedHead < this.retained.length) {
      const entry = this.retained[this.retainedHead++]
      if (entry?.active) return entry
    }
    return undefined
  }

  private deactivate(entry: BufferedEntry, dropped: boolean): void {
    if (!entry.active) return
    entry.active = false
    this.activeEvents = Math.max(0, this.activeEvents - 1)
    this.retainedBytes = Math.max(0, this.retainedBytes - entry.bytes)
    if (entry.event.sessionId) {
      const id = entry.event.sessionId
      this.sessionBytes.set(id, Math.max(0, (this.sessionBytes.get(id) || 0) - entry.bytes))
    }
    if (dropped) {
      this.droppedEvents += 1
      this.droppedBytes += entry.bytes
    }
  }

  private resolveWaiters(): void {
    for (const waiter of [...this.waiters]) {
      const batch = this.readSince(waiter.afterSequence, 100, waiter.filter)
      if (batch.events.length === 0 && batch.oldestSequence <= waiter.afterSequence + 1) continue
      this.removeWaiter(waiter)
      waiter.resolve(batch)
    }
  }

  private removeWaiter(waiter: Waiter): void {
    if (!this.waiters.delete(waiter)) return
    clearTimeout(waiter.timer)
    if (waiter.abort) waiter.signal?.removeEventListener('abort', waiter.abort)
  }

  private matches(event: RuntimeEvent, filter?: RuntimeEventFilter): boolean {
    if (!filter) return true
    if (filter.eventTypes?.length && !filter.eventTypes.includes(event.eventType)) return false
    if (
      filter.sessionIds?.length &&
      (!event.sessionId || !filter.sessionIds.includes(event.sessionId))
    )
      return false
    return true
  }

  private estimatePendingBytes(event: RuntimeEvent): number {
    const data =
      typeof event.payload.data === 'string'
        ? event.payload.data
        : typeof event.payload.text === 'string'
          ? event.payload.text
          : ''
    return 256 + data.length * 2
  }
}
