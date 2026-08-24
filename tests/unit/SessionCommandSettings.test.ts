import { describe, expect, it, vi } from 'vitest'
import ConnectionService from '../../src/main/services/ConnectionService'
import RuntimeEventHub from '../../src/main/services/RuntimeEventHub'

describe('Session command settings', () => {
  it('uses monotonic revisions and returns defensive copies', async () => {
    const service = new ConnectionService(
      {
        start: vi.fn(async () => ({ success: true })),
        send: vi.fn(async () => ({ success: true })),
        stop: vi.fn(async () => ({ success: true })),
        update: vi.fn(async () => ({ success: true }))
      },
      new RuntimeEventHub()
    )
    await service.start({ sessionId: 'settings', connectionType: 'com', comName: 'COM1' })
    const first = {
      autoNewline: true,
      hexMode: false,
      crcEnabled: true,
      crcMethod: 'CRC-16/MODBUS'
    }
    expect(service.updateCommandSettings('settings', first, 1)).toEqual({
      updated: true,
      revision: 1
    })
    expect(service.updateCommandSettings('settings', { ...first, hexMode: true }, 1)).toEqual({
      updated: false,
      revision: 1
    })
    const copy = service.getCommandSettings('settings')!
    copy.hexMode = true
    expect(service.getCommandSettings('settings')?.hexMode).toBe(false)
  })
})
