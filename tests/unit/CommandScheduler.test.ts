import { describe, expect, it } from 'vitest'
import CommandScheduler from '../../src/main/extensions/ai-control/application/CommandScheduler'

describe('CommandScheduler', () => {
  it('serializes the same session and allows different sessions', async () => {
    const scheduler = new CommandScheduler()
    const order: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = scheduler.run('s1', 'gui', async () => {
      order.push('a-start')
      await gate
      order.push('a-end')
    })
    const second = scheduler.run('s1', 'ai', async () => {
      order.push('b')
    })
    const other = scheduler.run('s2', 'ai', async () => {
      order.push('c')
    })
    await other
    release()
    await Promise.all([first, second])
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('a-end'))
    expect(order.slice(-2)).toEqual(['a-end', 'b'])
  })
})
