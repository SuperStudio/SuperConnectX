import { describe, expect, it, vi } from 'vitest'
import { useSerializedSettingsSave } from '../../src/renderer/src/composables/app/useSerializedSettingsSave'

describe('useSerializedSettingsSave', () => {
  it('serializes writes and saves immutable snapshots in order', async () => {
    const resolvers: Array<(value: boolean) => void> = []
    const saveApi = vi.fn(() => new Promise<boolean>((resolve) => resolvers.push(resolve)))
    const saver = useSerializedSettingsSave(saveApi)
    const settings = { maxLogCount: 10 }

    const first = saver.save(settings)
    settings.maxLogCount = 20
    const second = saver.save(settings)

    await Promise.resolve()
    expect(saveApi).toHaveBeenCalledWith({ maxLogCount: 10 })
    expect(saveApi).toHaveBeenCalledTimes(1)
    resolvers[0](true)
    await first
    await Promise.resolve()
    expect(saveApi).toHaveBeenCalledWith({ maxLogCount: 20 })
    resolvers[1](true)
    await expect(second).resolves.toBe(true)
  })

  it('reports a failed latest save without blocking the next queued save', async () => {
    const saveApi = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(true)
    const saver = useSerializedSettingsSave(saveApi)

    await expect(saver.save({ maxLogCount: 10 })).rejects.toThrow('failed')
    await expect(saver.waitForLatest()).resolves.toBe(false)
    await expect(saver.save({ maxLogCount: 20 })).resolves.toBe(true)
  })
})
