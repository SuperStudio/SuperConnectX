import { describe, expect, it, vi } from 'vitest'
import AiEventBuffer from '../../src/main/extensions/ai-control/application/AiEventBuffer'
import type { RuntimeEvent } from '../../src/main/services/types/RuntimeTypes'

const event = (sequence: number, data: string): RuntimeEvent => ({
  eventId: `e-${sequence}`,
  sequence,
  timestamp: new Date().toISOString(),
  eventType: 'rx.display' as const,
  sessionId: 's1',
  source: 'system' as const,
  payload: { data }
})

describe('AiEventBuffer', () => {
  it('does not clone or stringify RX data in the synchronous enqueue path', async () => {
    const buffer = new AiEventBuffer()
    const clone = vi.spyOn(globalThis, 'structuredClone')
    const stringify = vi.spyOn(JSON, 'stringify')

    buffer.enqueueRx(event(1, 'hot-path'))
    expect(clone).not.toHaveBeenCalled()
    expect(stringify).not.toHaveBeenCalled()

    await new Promise((resolve) => setImmediate(resolve))
    expect(clone).toHaveBeenCalled()
    expect(stringify).toHaveBeenCalled()
    clone.mockRestore()
    stringify.mockRestore()
    buffer.dispose()
  })

  it('flushes RX asynchronously and reads with a cursor', async () => {
    const buffer = new AiEventBuffer()
    buffer.enqueueRx(event(1, 'hello'))
    await new Promise((resolve) => setImmediate(resolve))
    const batch = buffer.readSince(0, 10, { sessionIds: ['s1'] })
    expect(batch.events[0].payload.data).toBe('hello')
    expect(batch.nextCursor).toBe(1)
    buffer.dispose()
  })

  it('keeps retained storage bounded', async () => {
    const buffer = new AiEventBuffer(16, 64 * 1024, 16 * 1024)
    for (let index = 1; index <= 40; index += 1) buffer.enqueueRx(event(index, 'x'.repeat(100)))
    await new Promise((resolve) => setTimeout(resolve, 20))
    const batch = buffer.readSince(0, 100)
    expect(batch.events.length).toBeLessThanOrEqual(16)
    expect(batch.droppedEvents).toBeGreaterThan(0)
    buffer.dispose()
  })
})
