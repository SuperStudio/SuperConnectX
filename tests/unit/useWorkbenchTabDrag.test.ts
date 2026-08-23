import { describe, expect, it, vi } from 'vitest'
import {
  getActiveWorkbenchDragSourcePanelId,
  useWorkbenchTabDrag
} from '../../src/renderer/src/foundation/workbench/useWorkbenchTabDrag'
import {
  WORKBENCH_TAB_DRAG_MIME,
  WORKBENCH_TAB_SOURCE_PANEL_MIME
} from '../../src/shared/workbench/types'

function createDataTransfer() {
  const values = new Map<string, string>()
  return {
    effectAllowed: '',
    dropEffect: '',
    setData: vi.fn((type: string, value: string) => values.set(type, value)),
    getData: vi.fn((type: string) => values.get(type) ?? ''),
    setDragImage: vi.fn()
  }
}

describe('useWorkbenchTabDrag', () => {
  it('publishes standard workbench drag data and the source panel', () => {
    const dataTransfer = createDataTransfer()
    const { onDragStart } = useWorkbenchTabDrag({
      panelId: 'panel-a',
      isPinned: () => false,
      onReorder: vi.fn()
    })

    onDragStart({ dataTransfer } as unknown as DragEvent, 'tab-a')

    expect(dataTransfer.getData(WORKBENCH_TAB_DRAG_MIME)).toBe('tab-a')
    expect(dataTransfer.getData(WORKBENCH_TAB_SOURCE_PANEL_MIME)).toBe('panel-a')
    expect(getActiveWorkbenchDragSourcePanelId()).toBe('panel-a')
  })

  it('reorders relative to the cursor position and preserves target pinning', () => {
    const onReorder = vi.fn()
    const { onDragStart, onDragOver, onDrop } = useWorkbenchTabDrag({
      panelId: 'panel-a',
      isPinned: tabId => tabId === 'tab-b',
      onReorder
    })
    const dataTransfer = createDataTransfer()
    const target = { getBoundingClientRect: () => ({ left: 100, width: 100 }) }

    onDragStart({ dataTransfer } as unknown as DragEvent, 'tab-a')
    onDragOver({ preventDefault: vi.fn(), dataTransfer, currentTarget: target, clientX: 110 } as unknown as DragEvent, 'tab-b')
    onDrop({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as DragEvent, 'tab-b')

    expect(onReorder).toHaveBeenCalledWith('tab-a', 'tab-b', 'before', true)
    expect(getActiveWorkbenchDragSourcePanelId()).toBe('')
  })
})
