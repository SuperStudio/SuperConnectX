/**
 * ConnectionService 测试
 * 验证共享连接边界不会在异常转换时丢失系统错误码。
 */
import { describe, expect, it, vi } from 'vitest'
import ConnectionService from '../../src/main/services/ConnectionService'
import RuntimeEventHub from '../../src/main/services/RuntimeEventHub'

describe('ConnectionService', () => {
  it('should preserve EACCES when the connection backend rejects', async () => {
    const error = Object.assign(new Error('Permission denied'), { code: 'EACCES' })
    const eventHub = new RuntimeEventHub()
    const service = new ConnectionService(
      {
        start: vi.fn(async () => {
          throw error
        }),
        send: vi.fn(async () => ({ success: true })),
        stop: vi.fn(async () => ({ success: true })),
        update: vi.fn(async () => ({ success: true }))
      },
      eventHub
    )

    const result = await service.start(
      { sessionId: 'serial-eacces', connectionType: 'com', comName: '/dev/ttyUSB0' },
      'gui'
    )

    expect(result).toEqual({
      success: false,
      message: 'Permission denied',
      code: 'EACCES'
    })
    expect(service.getSession('serial-eacces')).toBeUndefined()
    expect(eventHub.readSince(0).events.at(-1)?.payload.result).toEqual(result)
  })

  it('rejects duplicate IDs and treats repeated stop as idempotent', async () => {
    const backend = {
      start: vi.fn(async () => ({ success: true })),
      send: vi.fn(async () => ({ success: true })),
      stop: vi.fn(async () => ({ success: true })),
      update: vi.fn(async () => ({ success: true }))
    }
    const service = new ConnectionService(backend, new RuntimeEventHub())
    await expect(service.start({ sessionId: 'same' })).resolves.toEqual({ success: true })
    await expect(service.start({ sessionId: 'same' })).resolves.toMatchObject({
      code: 'SESSION_ALREADY_EXISTS'
    })
    await expect(service.stop('same')).resolves.toEqual({ success: true })
    await expect(service.stop('same')).resolves.toMatchObject({
      success: true,
      alreadyClosed: true
    })
    expect(backend.stop).toHaveBeenCalledTimes(1)
  })

  it('does not let an old start callback overwrite a newer generation', async () => {
    let finishOld!: (value: object) => void
    const oldStart = new Promise<object>((resolve) => {
      finishOld = resolve
    })
    const backend = {
      start: vi
        .fn()
        .mockImplementationOnce(() => oldStart)
        .mockResolvedValueOnce({ success: true }),
      send: vi.fn(async () => ({ success: true })),
      stop: vi.fn(async () => ({ success: true })),
      update: vi.fn(async () => ({ success: true }))
    }
    const service = new ConnectionService(backend, new RuntimeEventHub())
    const first = service.start({ sessionId: 'generation' })
    await service.stop('generation')
    await service.start({ sessionId: 'generation', name: 'new' })
    finishOld({ success: true })
    await expect(first).resolves.toMatchObject({ code: 'SESSION_CLOSED_DURING_START' })
    expect(service.getSession('generation')).toMatchObject({ state: 'connected', name: 'new' })
  })

  it('ignores an old backend close callback after the sessionId is reused', async () => {
    const lifecycles: Array<{ sessionId: string; generation: number }> = []
    const service = new ConnectionService(
      {
        start: vi.fn(async (_conn, lifecycle) => {
          lifecycles.push(lifecycle)
          return { success: true }
        }),
        send: vi.fn(async () => ({ success: true })),
        stop: vi.fn(async () => ({ success: true })),
        update: vi.fn(async () => ({ success: true }))
      },
      new RuntimeEventHub()
    )
    const closed = vi.fn()
    service.onSessionClosed(closed)

    await service.start({ sessionId: 'COM80', name: 'old' })
    await service.stop('COM80')
    await service.start({ sessionId: 'COM80', name: 'new' })

    expect(service.markClosed(lifecycles[0])).toBe(false)
    expect(service.getSession('COM80')).toMatchObject({ name: 'new', state: 'connected' })
    expect(closed).toHaveBeenCalledTimes(1)

    expect(service.markClosed(lifecycles[1])).toBe(true)
    expect(service.getSession('COM80')).toBeUndefined()
    expect(closed).toHaveBeenCalledTimes(2)
  })
})
