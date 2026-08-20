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
})
