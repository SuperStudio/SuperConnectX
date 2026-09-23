import { nextTick, ref, type Ref } from 'vue'

export interface NotificationItem {
  id: number
  title: string
  message: string
  focused: boolean
  count: number
}

export interface NotificationCenter {
  items: Ref<NotificationItem[]>
  add: (title: string, message: string, duration?: number) => number
  remove: (id: number) => void
  clear: () => void
}

/**
 * Domain-neutral, de-duplicating notification queue for a desktop application shell.
 * Positive durations run continuously; hover and focus do not pause the countdown.
 */
export function useNotificationCenter(onItemAdded?: () => void): NotificationCenter {
  const items = ref<NotificationItem[]>([])
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  let nextId = 0

  const startTimer = (id: number, duration: number): void => {
    const currentTimer = timers.get(id)
    if (currentTimer) clearTimeout(currentTimer)
    timers.delete(id)
    if (duration > 0) {
      timers.set(id, setTimeout(() => remove(id), duration))
    }
  }

  const add = (title: string, message: string, duration = 0): number => {
    const existing = items.value.find(item => item.title === title && item.message === message)
    if (existing) {
      existing.count++
      startTimer(existing.id, duration)
      const index = items.value.indexOf(existing)
      if (index > 0) {
        items.value.splice(index, 1)
        items.value.unshift(existing)
      }
      nextTick(() => onItemAdded?.())
      return existing.id
    }

    const id = ++nextId
    items.value.unshift({ id, title, message, focused: false, count: 1 })
    startTimer(id, duration)
    nextTick(() => onItemAdded?.())
    return id
  }

  const remove = (id: number): void => {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
    const index = items.value.findIndex(item => item.id === id)
    if (index >= 0) items.value.splice(index, 1)
  }

  const clear = (): void => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    items.value = []
  }

  return { items, add, remove, clear }
}
