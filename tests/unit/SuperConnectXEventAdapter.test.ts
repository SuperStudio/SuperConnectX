import { describe, expect, it } from 'vitest'
import SuperConnectXEventAdapter from '../../src/main/extensions/ai-control/adapters/host/SuperConnectXEventAdapter'
import AiEventBuffer from '../../src/main/extensions/ai-control/application/AiEventBuffer'
import RuntimeEventHub from '../../src/main/services/RuntimeEventHub'

describe('SuperConnectXEventAdapter', () => {
  it('projects TX command content according to the local activity policy', () => {
    const hub = new RuntimeEventHub()
    const buffer = new AiEventBuffer()
    hub.publish({
      eventType: 'tx.accepted',
      sessionId: 's1',
      source: 'gui',
      payload: {
        command: 'password=abc',
        text: 'password=abc',
        displayCommand: 'password=abc',
        byteLength: 12
      }
    })

    const hidden = new SuperConnectXEventAdapter(hub, buffer, () => 'none').read(0, 10)
    expect(hidden.events[0].payload).toEqual({ byteLength: 12 })

    const preview = new SuperConnectXEventAdapter(hub, buffer, () => 'preview').read(0, 10)
    expect(preview.events[0].payload.command).toBe('password=[REDACTED]')
    expect(preview.events[0].payload.text).toBe('password=[REDACTED]')
    buffer.dispose()
  })
})
