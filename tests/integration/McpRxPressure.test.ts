import { describe, expect, it, vi } from 'vitest'
import AiEventBuffer from '../../src/main/extensions/ai-control/application/AiEventBuffer'
import SuperConnectXEventAdapter from '../../src/main/extensions/ai-control/adapters/host/SuperConnectXEventAdapter'
import ConnectionStateManager from '../../src/main/ipc/connectors/ConnectionStateManager'
import RuntimeEventHub from '../../src/main/services/RuntimeEventHub'

describe('MCP RX pressure isolation', () => {
  it('bounds retained data for a slow reader and still wakes a current waiter', async () => {
    const buffer = new AiEventBuffer(64, 64 * 1024, 16 * 1024)
    for (let sequence = 1; sequence <= 2_000; sequence += 1) {
      buffer.enqueueRx({
        eventId: String(sequence),
        sequence,
        timestamp: new Date().toISOString(),
        eventType: 'rx.data',
        sessionId: 'pressure',
        source: 'system',
        payload: { text: 'x'.repeat(512) }
      })
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
    const slow = buffer.readSince(0, 1_000, { sessionIds: ['pressure'] }, 64 * 1024)
    expect(slow.events.length).toBeLessThanOrEqual(64)
    expect(slow.returnedBytes).toBeLessThanOrEqual(64 * 1024)
    expect(slow.droppedEvents).toBeGreaterThan(0)

    const waiter = buffer.waitSince(slow.latestSequence, { sessionIds: ['pressure'] }, 1_000)
    buffer.enqueueRx({
      eventId: 'latest',
      sequence: slow.latestSequence + 1,
      timestamp: new Date().toISOString(),
      eventType: 'rx.data',
      sessionId: 'pressure',
      source: 'system',
      payload: { text: 'ready' }
    })
    await expect(waiter).resolves.toMatchObject({
      events: [expect.objectContaining({ eventId: 'latest' })]
    })
    buffer.dispose()
  })

  it('keeps the complete renderer-to-MCP RX path bounded for a slow reader', async () => {
    const hub = new RuntimeEventHub()
    const buffer = new AiEventBuffer(64, 64 * 1024, 16 * 1024)
    hub.setRxSink((event) => buffer.enqueueRx(event))
    hub.setRxRetentionGate(() => true)
    const rendererSend = vi.fn()
    const state = new ConnectionStateManager()
    state.setEventHub(hub)
    state.init(
      {
        mainWindow: {
          webContents: { send: rendererSend, isDestroyed: () => false }
        }
      } as never,
      { flushConnLog: vi.fn() } as never
    )

    for (let sequence = 1; sequence <= 2_000; sequence += 1) {
      state.sendDataToRenderer('pressure', 'x'.repeat(512), String(sequence), false)
    }
    expect(rendererSend).toHaveBeenCalledTimes(2_000)
    await new Promise((resolve) => setTimeout(resolve, 50))

    const events = new SuperConnectXEventAdapter(hub, buffer).read(
      0,
      1_000,
      { sessionIds: ['pressure'] },
      64 * 1024
    )
    expect(events.events.length).toBeLessThanOrEqual(64)
    expect(events.returnedBytes).toBeLessThanOrEqual(64 * 1024)
    expect(events.droppedEvents).toBeGreaterThan(0)
    buffer.dispose()
  })
})
