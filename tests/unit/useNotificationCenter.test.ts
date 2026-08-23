import { describe, expect, it, vi } from 'vitest'
import { useNotificationCenter } from '../../src/renderer/src/foundation/shell/useNotificationCenter'

describe('useNotificationCenter', () => {
  it('adds new notifications at the front of the queue', () => {
    const { add, items } = useNotificationCenter()
    add('First', 'one')
    add('Second', 'two')

    expect(items.value.map(item => item.title)).toEqual(['Second', 'First'])
  })

  it('coalesces duplicate notifications and moves them to the front', () => {
    const onItemAdded = vi.fn()
    const { add, items } = useNotificationCenter(onItemAdded)
    const firstId = add('First', 'one')
    add('Second', 'two')
    const duplicateId = add('First', 'one')

    expect(duplicateId).toBe(firstId)
    expect(items.value).toHaveLength(2)
    expect(items.value[0]).toMatchObject({ id: firstId, count: 2 })
  })

  it('removes individual notifications and clears the queue', () => {
    const { add, remove, clear, items } = useNotificationCenter()
    const firstId = add('First', 'one')
    add('Second', 'two')
    remove(firstId)

    expect(items.value).toHaveLength(1)
    clear()
    expect(items.value).toEqual([])
  })
})
