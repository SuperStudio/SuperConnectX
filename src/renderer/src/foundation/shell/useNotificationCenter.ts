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
  add: (title: string, message: string) => number
  remove: (id: number) => void
  clear: () => void
}

/** Domain-neutral, de-duplicating notification queue for a desktop application shell. */
export function useNotificationCenter(onItemAdded?: () => void): NotificationCenter {
  const items = ref<NotificationItem[]>([])
  let nextId = 0

  const add = (title: string, message: string): number => {
    const existing = items.value.find(item => item.title === title && item.message === message)
    if (existing) {
      existing.count++
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
    nextTick(() => onItemAdded?.())
    return id
  }

  const remove = (id: number): void => {
    const index = items.value.findIndex(item => item.id === id)
    if (index >= 0) items.value.splice(index, 1)
  }

  const clear = (): void => {
    items.value = []
  }

  return { items, add, remove, clear }
}
