import { reactive } from 'vue'
import {
  WORKBENCH_TAB_DRAG_MIME,
  WORKBENCH_TAB_SOURCE_PANEL_MIME
} from '../../../../shared/workbench/types'

export type TabDropPosition = 'before' | 'after'

export interface WorkbenchTabDragOptions {
  panelId: string
  isPinned: (tabId: string) => boolean
  onReorder: (fromId: string, targetId: string, position: TabDropPosition, toPinned: boolean) => void
}

let activeDragSourcePanelId = ''

/** Returns the source panel while a workbench tab drag is active. */
export function getActiveWorkbenchDragSourcePanelId(): string {
  return activeDragSourcePanelId
}

/**
 * Provides domain-neutral drag ordering for a workbench tab strip.
 * The host owns tab rendering, persistence, pinning and reorder actions.
 */
export function useWorkbenchTabDrag(options: WorkbenchTabDragOptions) {
  const dragState = reactive({
    draggingId: '',
    overId: '',
    dropPosition: '' as TabDropPosition | ''
  })

  const resetDragState = (): void => {
    dragState.draggingId = ''
    dragState.overId = ''
    dragState.dropPosition = ''
    activeDragSourcePanelId = ''
  }

  const onDragStart = (event: DragEvent, tabId: string, dragImageTarget?: HTMLElement | null): void => {
    dragState.draggingId = tabId
    activeDragSourcePanelId = options.panelId
    if (!event.dataTransfer) return

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', tabId)
    event.dataTransfer.setData(WORKBENCH_TAB_DRAG_MIME, tabId)
    event.dataTransfer.setData(WORKBENCH_TAB_SOURCE_PANEL_MIME, options.panelId)
    const dragImage = dragImageTarget ?? event.currentTarget as HTMLElement | null
    if (dragImage) {
      event.dataTransfer.setDragImage(dragImage, dragImage.offsetWidth / 2, dragImage.offsetHeight / 2)
    }
  }

  const onDragOver = (event: DragEvent, tabId: string): void => {
    event.preventDefault()
    if (!dragState.draggingId || dragState.draggingId === tabId) return
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'

    const element = event.currentTarget as HTMLElement
    const rect = element.getBoundingClientRect()
    dragState.dropPosition = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
  }

  const onDragEnter = (event: DragEvent, tabId: string): void => {
    event.preventDefault()
    if (!dragState.draggingId || dragState.draggingId === tabId) return
    dragState.overId = tabId
  }

  const onDragLeave = (event: DragEvent, tabId: string): void => {
    const relatedTarget = event.relatedTarget as HTMLElement | null
    const currentTarget = event.currentTarget as HTMLElement
    if (!currentTarget.contains(relatedTarget) && dragState.overId === tabId) {
      dragState.overId = ''
      dragState.dropPosition = ''
    }
  }

  const onDrop = (event: DragEvent, tabId: string): void => {
    event.preventDefault()
    event.stopPropagation()
    if (dragState.draggingId && dragState.draggingId !== tabId && dragState.dropPosition) {
      options.onReorder(dragState.draggingId, tabId, dragState.dropPosition, options.isPinned(tabId))
    }
    resetDragState()
  }

  return { dragState, onDragStart, onDragOver, onDragEnter, onDragLeave, onDrop, resetDragState }
}
