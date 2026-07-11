/**
 * useSplitPanel - 分屏状态管理
 * 管理面板的拆分、调整大小、合并
 */

import { ref, reactive, computed } from 'vue'

export interface Panel {
  id: string
  activeTabId: string  // 该面板当前显示的 tab id
  tabIds: string[]     // 该面板拥有的 tab id 列表
}

export interface SplitState {
  panels: Panel[]
  direction: 'horizontal' | 'vertical'  // 拆分方向
  splitRatio: number  // 0.0 ~ 1.0，第一个面板的比例
  isSplitting: boolean
}

export function useSplitPanel(defaultTabId: string) {
  const splitState = reactive<SplitState>({
    panels: [
      { id: 'panel-0', activeTabId: '', tabIds: [] }
    ],
    direction: 'horizontal',
    splitRatio: 0.5,
    isSplitting: false
  })

  const panelCount = computed(() => splitState.panels.length)

  /**
   * 在当前面板旁边拆分出新面板
   * @param panelId 参考面板 id
   * @param direction 拆分方向（新面板在右边/下面）
   */
  const splitPanel = (panelId: string, direction: 'horizontal' | 'vertical' = 'horizontal') => {
    const idx = splitState.panels.findIndex(p => p.id === panelId)
    if (idx === -1) return

    // 新面板初始不显示任何 tab（由调用方设置）
    const newPanel: Panel = {
      id: `panel-${Date.now()}`,
      activeTabId: '',
      tabIds: []
    }

    splitState.direction = direction
    // 将新面板插入到参考面板后面
    splitState.panels.splice(idx + 1, 0, newPanel)
    splitState.splitRatio = 0.5
  }

  /**
   * 移除面板（合并回上一个面板）
   */
  const removePanel = (panelId: string) => {
    if (splitState.panels.length <= 1) return

    const idx = splitState.panels.findIndex(p => p.id === panelId)
    if (idx === -1) return

    // 将被移除面板的 tabIds 合并到第一个面板
    const removedPanel = splitState.panels[idx]
    if (removedPanel.tabIds.length > 0 && splitState.panels.length > 1) {
      const targetPanel = idx === 0 ? splitState.panels[1] : splitState.panels[0]
      for (const tabId of removedPanel.tabIds) {
        if (!targetPanel.tabIds.includes(tabId)) {
          targetPanel.tabIds.push(tabId)
        }
      }
    }

    splitState.panels.splice(idx, 1)

    // 如果只剩一个面板，重置方向
    if (splitState.panels.length === 1) {
      splitState.splitRatio = 1
    }
  }

  /**
   * 切换面板显示的 tab
   */
  const switchPanelTab = (panelId: string, tabId: string) => {
    const panel = splitState.panels.find(p => p.id === panelId)
    if (panel) {
      panel.activeTabId = tabId
    }
  }

  /**
   * 更新分屏比例
   */
  const updateSplitRatio = (ratio: number) => {
    splitState.splitRatio = Math.max(0.1, Math.min(0.9, ratio))
  }

  /**
   * 关闭面板中显示的 tab（如果该 tab 被关闭）
   */
  const onTabClosed = (tabId: string) => {
    // 从所有面板的 tabIds 中移除
    for (const panel of splitState.panels) {
      const idx = panel.tabIds.indexOf(tabId)
      if (idx >= 0) {
        panel.tabIds.splice(idx, 1)
      }
      if (panel.activeTabId === tabId) {
        panel.activeTabId = panel.tabIds.length > 0 ? panel.tabIds[0] : ''
      }
    }

    // 移除没有 tab 的面板
    for (let i = splitState.panels.length - 1; i >= 0; i--) {
      if (splitState.panels[i].tabIds.length === 0 && splitState.panels.length > 1) {
        splitState.panels.splice(i, 1)
      }
    }

    if (splitState.panels.length === 1) {
      splitState.splitRatio = 1
    }
  }

  /**
   * 获取所有面板使用的 tab id 集合
   */
  const getUsedTabIds = computed(() => {
    const ids = new Set<string>()
    for (const panel of splitState.panels) {
      for (const tabId of panel.tabIds) {
        if (tabId) ids.add(tabId)
      }
    }
    return ids
  })

  /**
   * 获取面板的 tab id 集合（用于传给 TerminalContainer）
   */
  const getPanelTabIdSet = (panelId: string): Set<string> => {
    const panel = splitState.panels.find(p => p.id === panelId)
    if (!panel) return new Set()
    return new Set(panel.tabIds)
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
