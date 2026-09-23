import { computed, ref, type Ref } from 'vue'

export interface SidebarResizeOptions {
  initialWidth: number
  minWidth?: number
  maxWidth?: number
  storageKey?: string
}

export interface SidebarResizeController {
  width: Ref<number>
  isResizing: Ref<boolean>
  startResize: (event: MouseEvent) => void
  resetWidth: () => void
  style: Ref<{ width: string }>
}

/**
 * Persists the user-resized sidebar width across reloads.
 * Width bounds clamp the value before persisting to localStorage.
 */
export function useSidebarResize(options: SidebarResizeOptions): SidebarResizeController {
  const minWidth = options.minWidth ?? 160
  const maxWidth = options.maxWidth ?? 480
  const storageKey = options.storageKey ?? 'app-sidebar-width'

  const initialRaw = (() => {
    const stored = options.storageKey ? Number(localStorage.getItem(storageKey)) : NaN
    return Number.isFinite(stored) && stored >= minWidth && stored <= maxWidth ? stored : options.initialWidth
  })()

  const width = ref(initialRaw)
  const isResizing = ref(false)
  let resizeStartX = 0
  let startWidth = 0

  const persist = (value: number): void => {
    if (options.storageKey) localStorage.setItem(storageKey, String(value))
  }

  const startResize = (event: MouseEvent): void => {
    event.preventDefault()
    isResizing.value = true
    resizeStartX = event.clientX
    startWidth = width.value
    document.addEventListener('mousemove', onResize)
    document.addEventListener('mouseup', stopResize)
  }

  const onResize = (event: MouseEvent): void => {
    if (!isResizing.value) return
    const next = Math.max(minWidth, Math.min(maxWidth, startWidth + (event.clientX - resizeStartX)))
    width.value = next
    persist(next)
  }

  const stopResize = (): void => {
    if (!isResizing.value) return
    isResizing.value = false
    document.removeEventListener('mousemove', onResize)
    document.removeEventListener('mouseup', stopResize)
  }

  const resetWidth = (): void => {
    width.value = options.initialWidth
    persist(options.initialWidth)
  }

  const style = computed(() => ({ width: `${width.value}px` }))

  return { width, isResizing, startResize, resetWidth, style }
}
