/**
 * useWorkbenchTabs — application-agnostic tab strip controller.
 *
 * Owns only the *structure* of a tab strip:
 * - ordered tab list and the current activation
 * - the pinned tab marker set
 * - drag re-ordering (including pin/unpin transitions)
 * - right-click context-menu state
 * - physical removal of a tab from the strip
 *
 * Tabs are opaque host values (`{ id }`). Content lifecycle — connecting,
 * disconnecting or disposing session resources — stays in the application
 * feature layer which composes this controller.
 */
import { reactive, ref, type Ref } from 'vue'

/** Minimal contract a host tab must satisfy to be managed here. */
export interface WorkbenchTabLike {
  /** Opaque tab identifier owned by the host application. */
  id: string
}

export interface UseWorkbenchTabsOptions {
  /**
   * CSS selector locating a single tab element inside the tab strip.
   * Used by {@link openNavTabContextMenu} to resolve the tab under the cursor.
   * @default '.tab-item'
   */
  tabItemSelector?: string
}

/** Public surface returned by {@link useWorkbenchTabs}. */
export interface WorkbenchTabsController<T extends WorkbenchTabLike> {
  tabs: Ref<T[]>
  activeTabId: Ref<string>
  /** Ids of the tabs pinned in the leading region of the strip. */
  pinnedTabs: Set<string>
  showTabMenu: Ref<boolean>
  tabMenuPosition: Ref<{ x: number; y: number }>
  rightClickedTab: Ref<T | null>
  activate: (tabId: string | number) => void
  addTab: (tab: T) => void
  isPinned: (tabId: string | number) => boolean
  openTabContextMenu: (event: MouseEvent, tab: T) => void
  openNavTabContextMenu: (event: MouseEvent) => void
  hideTabMenu: () => void
  removeTab: (tabId: string | number) => void
  reorderTabs: (fromId: string, targetId: string, dropPosition?: string, toPin?: boolean) => void
  moveTabToFirst: () => void
  moveTabToLast: () => void
  togglePin: (tabId: string | number) => boolean
  togglePinContext: () => void
}

export function useWorkbenchTabs<T extends WorkbenchTabLike>(
  options: UseWorkbenchTabsOptions = {}
): WorkbenchTabsController<T> {
  const tabItemSelector = options.tabItemSelector ?? '.tab-item'

  // ---- state ----
  const tabs = ref<T[]>([]) as Ref<T[]>
  const activeTabId = ref('')
  const pinnedTabs = reactive<Set<string>>(new Set())

  // 右键菜单状态
  const showTabMenu = ref(false)
  const tabMenuPosition = ref({ x: 0, y: 0 })
  const rightClickedTab = ref<T | null>(null) as Ref<T | null>

  // ---- activation / insertion ----
  const activate = (tabId: string | number): void => {
    activeTabId.value = tabId.toString()
  }

  const addTab = (tab: T): void => {
    tabs.value.push(tab)
    activeTabId.value = tab.id.toString()
  }

  const isPinned = (tabId: string | number): boolean => {
    const id = tabId.toString()
    return tabs.value.some((t) => t.id.toString() === id) && pinnedTabs.has(id)
  }

  // ---- context menu ----
  const openTabContextMenu = (event: MouseEvent, tab: T): void => {
    event.preventDefault()
    event.stopPropagation()
    rightClickedTab.value = tab
    tabMenuPosition.value = { x: event.clientX, y: event.clientY }
    showTabMenu.value = true
  }

  const hideTabMenu = (): void => {
    showTabMenu.value = false
    rightClickedTab.value = null
  }

  const openNavTabContextMenu = (event: MouseEvent): void => {
    const tabEl = (event.target as HTMLElement).closest(tabItemSelector)
    if (tabEl) {
      const tabId = tabEl.getAttribute('data-tab-id')
      const tab = tabs.value.find((t) => t.id === tabId)
      if (tab) openTabContextMenu(event, tab)
    } else if (showTabMenu.value) {
      event.preventDefault()
      hideTabMenu()
    }
  }

  // ---- removal ----
  /**
   * Physically removes a tab from the strip (and its pin marker). When the
   * active tab is removed the last remaining tab becomes active.
   * Does not run any resource cleanup — the caller decides whether and when
   * a tab may be closed.
   */
  const removeTab = (tabId: string | number): void => {
    const id = tabId.toString()
    pinnedTabs.delete(id)
    const index = tabs.value.findIndex((t) => t.id.toString() === id)
    if (index !== -1) tabs.value.splice(index, 1)
    if (activeTabId.value === id && tabs.value.length > 0) {
      activeTabId.value = tabs.value[tabs.value.length - 1].id.toString()
    }
  }

  // ---- drag re-ordering ----
  /**
   * Re-orders tabs, optionally pinning/unpinning the dragged tab so it can
   * cross the pinned / unpinned boundary.
   * @param fromId      dragged tab id
   * @param targetId    tab id at the drop position
   * @param dropPosition 'before' | 'after'
   * @param toPin        whether the dragged tab becomes pinned
   */
  const reorderTabs = (
    fromId: string,
    targetId: string,
    dropPosition: string = 'after',
    toPin: boolean = false
  ): void => {
    const fromIndex = tabs.value.findIndex((t) => t.id === fromId)
    if (fromIndex === -1) return

    const isFromPinned = pinnedTabs.has(fromId)
    if (toPin && !isFromPinned) {
      pinnedTabs.add(fromId)
    } else if (!toPin && isFromPinned) {
      pinnedTabs.delete(fromId)
    }

    const tab = tabs.value.splice(fromIndex, 1)[0]

    const toIndex = tabs.value.findIndex((t) => t.id === targetId)
    if (toIndex === -1) {
      // targetId 可能因为 splice 找不到，尝试恢复
      tabs.value.splice(fromIndex, 0, tab)
      return
    }

    // before: 插入到目标前面; after: 插入到目标后面
    const insertIndex = dropPosition === 'before' ? toIndex : toIndex + 1
    tabs.value.splice(insertIndex, 0, tab)
  }

  // ---- move to strip edges (context-menu driven) ----
  const moveTabToFirst = (): void => {
    if (!rightClickedTab.value) return
    const tabId = rightClickedTab.value.id
    const currentIndex = tabs.value.findIndex((t) => t.id === tabId)
    if (currentIndex === -1) return
    const isPinnedTab = pinnedTabs.has(tabId)
    if (isPinnedTab) {
      const firstPinnedIndex = tabs.value.findIndex((t) => pinnedTabs.has(t.id))
      if (currentIndex !== firstPinnedIndex) {
        const tab = tabs.value.splice(currentIndex, 1)[0]
        tabs.value.splice(firstPinnedIndex, 0, tab)
      }
    } else {
      let firstUnpinnedIndex = -1
      for (let i = 0; i < tabs.value.length; i++) {
        if (!pinnedTabs.has(tabs.value[i].id)) {
          firstUnpinnedIndex = i
          break
        }
      }
      if (firstUnpinnedIndex === -1) firstUnpinnedIndex = tabs.value.length
      if (currentIndex !== firstUnpinnedIndex) {
        const tab = tabs.value.splice(currentIndex, 1)[0]
        tabs.value.splice(firstUnpinnedIndex, 0, tab)
      }
    }
    hideTabMenu()
  }

  const moveTabToLast = (): void => {
    if (!rightClickedTab.value) return
    const tabId = rightClickedTab.value.id
    const currentIndex = tabs.value.findIndex((t) => t.id === tabId)
    if (currentIndex === -1) return
    const isPinnedTab = pinnedTabs.has(tabId)
    if (isPinnedTab) {
      let lastPinnedIndex = -1
      for (let i = tabs.value.length - 1; i >= 0; i--) {
        if (pinnedTabs.has(tabs.value[i].id)) {
          lastPinnedIndex = i
          break
        }
      }
      if (currentIndex !== lastPinnedIndex) {
        const tab = tabs.value.splice(currentIndex, 1)[0]
        tabs.value.splice(lastPinnedIndex, 0, tab)
      }
    } else {
      let lastUnpinnedIndex = -1
      for (let i = tabs.value.length - 1; i >= 0; i--) {
        if (!pinnedTabs.has(tabs.value[i].id)) {
          lastUnpinnedIndex = i
          break
        }
      }
      if (currentIndex !== lastUnpinnedIndex) {
        const tab = tabs.value.splice(currentIndex, 1)[0]
        tabs.value.splice(lastUnpinnedIndex, 0, tab)
      }
    }
    hideTabMenu()
  }

  // ---- pin toggling ----
  const getLastPinnedIndex = (): number => {
    let lastIndex = -1
    tabs.value.forEach((tab, index) => {
      if (pinnedTabs.has(tab.id) && index > lastIndex) lastIndex = index
    })
    return lastIndex
  }

  /**
   * Toggles the pin of an explicit tab id, keeping pinned tabs in their own
   * leading region. Returns false when the id is not present in the strip.
   */
  const togglePin = (tabId: string | number): boolean => {
    const id = tabId.toString()
    const currentIndex = tabs.value.findIndex((t) => t.id.toString() === id)
    if (currentIndex === -1) return false

    if (pinnedTabs.has(id)) {
      const lastPinnedIndex = getLastPinnedIndex()
      pinnedTabs.delete(id)
      if (lastPinnedIndex >= 0 && currentIndex !== lastPinnedIndex) {
        const tab = tabs.value.splice(currentIndex, 1)[0]
        tabs.value.splice(lastPinnedIndex, 0, tab)
      }
    } else {
      const lastPinnedIndex = getLastPinnedIndex()
      pinnedTabs.add(id)
      if (lastPinnedIndex >= 0 && currentIndex !== lastPinnedIndex) {
        const tab = tabs.value.splice(currentIndex, 1)[0]
        tabs.value.splice(lastPinnedIndex + 1, 0, tab)
      } else if (lastPinnedIndex === -1 && currentIndex !== 0) {
        const tab = tabs.value.splice(currentIndex, 1)[0]
        tabs.value.unshift(tab)
      }
    }
    return true
  }

  /** Pin toggle for the tab currently selected in the context menu. */
  const togglePinContext = (): void => {
    if (!rightClickedTab.value) return
    const id = rightClickedTab.value.id.toString()
    if (togglePin(id)) hideTabMenu()
  }

  return {
    tabs,
    activeTabId,
    pinnedTabs,
    showTabMenu,
    tabMenuPosition,
    rightClickedTab,
    activate,
    addTab,
    isPinned,
    openTabContextMenu,
    openNavTabContextMenu,
    hideTabMenu,
    removeTab,
    reorderTabs,
    moveTabToFirst,
    moveTabToLast,
    togglePin,
    togglePinContext
  }
}
