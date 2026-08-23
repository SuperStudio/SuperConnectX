import { ref, type Ref } from 'vue'

export interface SidebarResizeOptions {
  width: Ref<number>
  visible: Ref<boolean>
  minWidth?: number
  maxWidth?: number
  collapseThreshold?: number
}

/** Manages pointer resizing and optional collapse for any side panel. */
export function useSidebarResize(options: SidebarResizeOptions) {
  const isResizing = ref(false)
  let startX = 0
  let startWidth = 0
  const minWidth = options.minWidth ?? 200
  const maxWidth = options.maxWidth ?? 500
  const collapseThreshold = options.collapseThreshold ?? minWidth * 2 / 3

  const onResize = (event: MouseEvent): void => {
    if (!isResizing.value) return
    const nextWidth = startWidth + event.clientX - startX
    if (nextWidth > maxWidth) return
    if (nextWidth < collapseThreshold) {
      options.visible.value = false
      options.width.value = minWidth
      return
    }
    options.width.value = Math.max(minWidth, nextWidth)
  }

  const stopResize = (): void => {
    if (!isResizing.value) return
    isResizing.value = false
    document.removeEventListener('mousemove', onResize)
    document.removeEventListener('mouseup', stopResize)
  }

  const startResize = (event: MouseEvent): void => {
    event.preventDefault()
    isResizing.value = true
    startX = event.clientX
    startWidth = options.width.value
    document.addEventListener('mousemove', onResize)
    document.addEventListener('mouseup', stopResize)
  }

  return { isResizing, startResize, stopResize }
}
