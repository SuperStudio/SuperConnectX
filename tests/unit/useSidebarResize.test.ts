import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useSidebarResize } from '../../src/renderer/src/foundation/shell/useSidebarResize'

const listeners = new Map<string, EventListener>()

beforeEach(() => {
  listeners.clear()
  vi.stubGlobal('document', {
    addEventListener: vi.fn((name: string, listener: EventListener) => listeners.set(name, listener)),
    removeEventListener: vi.fn((name: string) => listeners.delete(name))
  })
})

describe('useSidebarResize', () => {
  it('updates the width within its configured bounds', () => {
    const width = ref(250)
    const visible = ref(true)
    const { isResizing, startResize } = useSidebarResize({ width, visible })

    startResize({ clientX: 100, preventDefault: vi.fn() } as unknown as MouseEvent)
    listeners.get('mousemove')?.({ clientX: 200 } as MouseEvent)

    expect(isResizing.value).toBe(true)
    expect(width.value).toBe(350)
    expect(visible.value).toBe(true)
  })

  it('collapses the panel below its collapse threshold', () => {
    const width = ref(250)
    const visible = ref(true)
    const { startResize } = useSidebarResize({ width, visible, minWidth: 200 })

    startResize({ clientX: 300, preventDefault: vi.fn() } as unknown as MouseEvent)
    listeners.get('mousemove')?.({ clientX: 150 } as MouseEvent)

    expect(visible.value).toBe(false)
    expect(width.value).toBe(200)
  })

  it('removes document listeners when resizing stops', () => {
    const { startResize, stopResize, isResizing } = useSidebarResize({
      width: ref(250),
      visible: ref(true)
    })

    startResize({ clientX: 0, preventDefault: vi.fn() } as unknown as MouseEvent)
    stopResize()

    expect(isResizing.value).toBe(false)
    expect(listeners.size).toBe(0)
  })
})
