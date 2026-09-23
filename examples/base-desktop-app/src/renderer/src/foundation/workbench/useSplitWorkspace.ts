import { computed, reactive } from 'vue'
import type { WorkbenchPanel, WorkbenchSplitState } from '../../../../shared/workbench/types'

export type Panel = WorkbenchPanel
export type SplitState = WorkbenchSplitState

/**
 * Manages a generic tab workspace split layout.
 * Tab IDs are opaque values; content lifecycle remains the application's job.
 */
export function useSplitWorkspace() {
  const splitState = reactive<SplitState>({
    panels: [{ id: 'panel-0', activeTabId: '', tabIds: [] }],
    direction: 'horizontal',
    splitRatio: 0.5,
    isSplitting: false
  })

  const panelCount = computed(() => splitState.panels.length)

  const splitPanel = (panelId: string, direction: 'horizontal' | 'vertical' = 'horizontal') => {
    const index = splitState.panels.findIndex((panel) => panel.id === panelId)
    if (index === -1) return

    const newPanel: Panel = { id: `panel-${Date.now()}`, activeTabId: '', tabIds: [] }
    splitState.direction = direction
    splitState.panels.splice(index + 1, 0, newPanel)
    splitState.splitRatio = 0.5
  }

  const removePanel = (panelId: string) => {
    if (splitState.panels.length <= 1) return
    const index = splitState.panels.findIndex((panel) => panel.id === panelId)
    if (index === -1) return

    const removedPanel = splitState.panels[index]
    const targetPanel = index === 0 ? splitState.panels[1] : splitState.panels[0]
    for (const tabId of removedPanel.tabIds) {
      if (!targetPanel.tabIds.includes(tabId)) targetPanel.tabIds.push(tabId)
    }
    splitState.panels.splice(index, 1)
    if (splitState.panels.length === 1) splitState.splitRatio = 1
  }

  const switchPanelTab = (panelId: string, tabId: string) => {
    const panel = splitState.panels.find((item) => item.id === panelId)
    if (panel) panel.activeTabId = tabId
  }

  const updateSplitRatio = (ratio: number) => {
    splitState.splitRatio = Math.max(0.1, Math.min(0.9, ratio))
  }

  const onTabClosed = (tabId: string) => {
    for (const panel of splitState.panels) {
      const index = panel.tabIds.indexOf(tabId)
      if (index >= 0) panel.tabIds.splice(index, 1)
      if (panel.activeTabId === tabId) panel.activeTabId = panel.tabIds[0] ?? ''
    }

    for (let index = splitState.panels.length - 1; index >= 0; index--) {
      if (splitState.panels[index].tabIds.length === 0 && splitState.panels.length > 1) {
        splitState.panels.splice(index, 1)
      }
    }
    if (splitState.panels.length === 1) splitState.splitRatio = 1
  }

  const getUsedTabIds = computed(() => new Set(splitState.panels.flatMap((panel) => panel.tabIds.filter(Boolean))))

  const getPanelTabIdSet = (panelId: string): Set<string> => {
    const panel = splitState.panels.find((item) => item.id === panelId)
    return new Set(panel?.tabIds ?? [])
  }

  return {
    splitState,
    panelCount,
    splitPanel,
    removePanel,
    switchPanelTab,
    updateSplitRatio,
    onTabClosed,
    getUsedTabIds,
    getPanelTabIdSet
  }
}
