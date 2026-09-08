import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useNotificationCenter } from '../../src/renderer/src/foundation/shell/useNotificationCenter'

describe('useNotificationCenter', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

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

  it('notifies after adding both new and duplicate items', async () => {
    const onItemAdded = vi.fn()
    const { add } = useNotificationCenter(onItemAdded)

    add('Title', 'message', 0)
    await nextTick()
    add('Title', 'message', 0)
    await nextTick()

    expect(onItemAdded).toHaveBeenCalledTimes(2)
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

  it('automatically removes a notification after its duration', () => {
    const { add, items } = useNotificationCenter()
    add('Title', 'message', 1000)

    vi.advanceTimersByTime(999)
    expect(items.value).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(items.value).toEqual([])
  })

  it('keeps notifications permanently by default', () => {
    const { add, items } = useNotificationCenter()
    add('Title', 'message')

    vi.runAllTimers()
    expect(items.value).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restarts the timer when a duplicate notification is added', () => {
    const { add, items } = useNotificationCenter()
    add('Title', 'message', 1000)
    vi.advanceTimersByTime(750)
    add('Title', 'message', 1000)

    vi.advanceTimersByTime(750)
    expect(items.value).toHaveLength(1)
    vi.advanceTimersByTime(250)
    expect(items.value).toEqual([])
  })

  it('keeps duration zero notifications until explicitly removed', () => {
    const { add, items } = useNotificationCenter()
    add('Title', 'message', 0)
    vi.runAllTimers()
    expect(items.value).toHaveLength(1)
  })

  it('does not schedule a timer for negative durations', () => {
    const { add, items } = useNotificationCenter()

    add('Title', 'message', -1)
    vi.runAllTimers()

    expect(items.value).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels timers when notifications are removed or cleared', () => {
    const { add, remove, clear } = useNotificationCenter()
    const id = add('First', 'one', 1000)
    add('Second', 'two', 1000)
    expect(vi.getTimerCount()).toBe(2)

    remove(id)
    expect(vi.getTimerCount()).toBe(1)
    clear()
    expect(vi.getTimerCount()).toBe(0)
  })
})
