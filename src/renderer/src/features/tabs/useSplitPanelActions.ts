/**
 * useSplitPanelActions - 分屏面板中的业务 Tab 动作编排（业务层）
 *
 * 把 App.vue 中散落的「面板限定右键命令 / Tab 归属查询 / 拖拽分屏与移动 /
 * 空面板自动合并」编排收敛为可组合的控制器。它串联两个核心：
 * - foundation/workbench/useSplitWorkspace（分屏布局模型的读写）
 * - features/tabs/useTabManager（业务 Tab 列表 / 激活 / 右键菜单状态 / 关闭）
 *
 * 通过 options 注入共享引用（同一 useSplitWorkspace 实例与终端实例句柄），
 * 保证与 App.vue 装配层读写的是同一份响应式状态。
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { TabItem } from './useTabManager'
import type { ComTerminalRef, TelnetTerminalRef } from './types'
import type { Panel, SplitState } from '@superx/foundation/workbench/useSplitWorkspace'

export interface SplitPanelActionsOptions {
  connectionTabs: Ref<TabItem[]>
  activeTabId: Ref<string>
  splitState: SplitState
  splitPanel: (panelId: string, direction?: 'horizontal' | 'vertical') => void
  showTabMenu: Ref<boolean>
  rightClickedTab: Ref<TabItem | null>
  hideTabMenu: () => void
  closeTabOnly: (tabId: string) => Promise<void>
  getConnectionStatus: (tab: TabItem) => string
  comTerminalRefs: Record<string, ComTerminalRef>
  telnetTerminalRefs: Record<string, TelnetTerminalRef>
  connectionChangeCounter: Ref<number>
}

/** Public surface returned by {@link useSplitPanelActions}. */
export interface SplitPanelActionsController {
  rightClickedPanelId: Ref<string>
  isSplit: ComputedRef<boolean>
  isPanelShowTabMenu: (panelId: string) => boolean
  checkAndMergeEmptyPanels: () => void
  getTabPanelId: (tabId: string) => string
  isTabActiveInItsPanel: (tabId: string) => boolean
  getRightClickedPanelTabIds: () => string[]
  getPanelDisplayTabIds: (panelId: string) => string[]
  panelHasAnyConnected: ComputedRef<Record<string, boolean>>
  getPanelHasAnyConnected: (panelId: string) => boolean
  disconnectAllTabsForPanel: () => Promise<void>
  connectAllTabsForPanel: () => Promise<void>
  closeOtherTabsForPanel: () => Promise<void>
  closeLeftTabsForPanel: () => Promise<void>
  closeRightTabsForPanel: () => Promise<void>
  closeAllTabsForPanel: () => Promise<void>
  handleSplitToNewPanel: () => void
  handleTabDropToPane: (tabId: string, sourcePanelId: string, targetZone: string) => void
  performSplitWithTab: (tabId: string, sourcePanelId: string) => void
  moveTabToPanel: (tabId: string, sourcePanelId: string, targetZone: string) => void
  getPanelTabs: (panel: { id: string; tabIds: string[] }) => TabItem[]
  getPanel0Tabs: () => TabItem[]
}

export function useSplitPanelActions(
  options: SplitPanelActionsOptions
): SplitPanelActionsController {
  const {
    connectionTabs,
    activeTabId,
    splitState,
    splitPanel,
    showTabMenu,
    rightClickedTab,
    hideTabMenu,
    closeTabOnly,
    getConnectionStatus,
    comTerminalRefs,
    telnetTerminalRefs,
    connectionChangeCounter
  } = options

  // 记录右键菜单所在的面板 ID
  const rightClickedPanelId = ref('panel-0')

  // 当前是否处于分屏状态
  const isSplit = computed(() => splitState.panels.length > 1)

  // 获取 panel-0 的 tabs（排除已分屏到其他面板的 tab）
  const getPanel0Tabs = (): TabItem[] => {
    if (splitState.panels.length <= 1) {
      // 单面板：显示所有 tab
      return connectionTabs.value
    }
    // 分屏时：排除属于其他面板的 tab
    const otherTabIds = new Set<string>()
    for (let i = 1; i < splitState.panels.length; i++) {
      for (const id of splitState.panels[i].tabIds) {
        otherTabIds.add(id)
      }
    }
    return connectionTabs.value.filter((t) => !otherTabIds.has(t.id.toString()))
  }

  // 获取某个面板拥有的 tabs（过滤 connectionTabs）
  const getPanelTabs = (panel: { id: string; tabIds: string[] }): TabItem[] => {
    const tabIdSet = new Set(panel.tabIds)
    return connectionTabs.value.filter((t) => tabIdSet.has(t.id.toString()))
  }

  // 获取 tab 所属的面板 ID
  // 优先级：分屏时 panel-1 优先（因为 panel-0 保留所有 tab 作为"备份"）
  // 非分屏时所有 tab 属于 panel-0
  const getTabPanelId = (tabId: string): string => {
    if (isSplit.value) {
      // 分屏时，检查非 panel-0 的面板（它们的 tabIds 是"专属"列表）
      for (let i = splitState.panels.length - 1; i >= 1; i--) {
        if (splitState.panels[i].tabIds.includes(tabId)) {
          return splitState.panels[i].id
        }
      }
    }
    // 默认在 panel-0
    return 'panel-0'
  }

  // 判断 tab 是否在其所属面板中是 activeTabId
  const isTabActiveInItsPanel = (tabId: string): boolean => {
    const panelId = getTabPanelId(tabId)
    const panel = splitState.panels.find((p) => p.id === panelId)
    if (!panel) return false
    return panel.activeTabId === tabId
  }

  // 获取某个面板实际显示的 tabIds（分屏时 panel-0 排除属于其他面板的 tab）
  const getPanelDisplayTabIds = (panelId: string): string[] => {
    if (panelId === 'panel-0') {
      return getPanel0Tabs().map((t) => t.id.toString())
    }
    const panel = splitState.panels.find((p) => p.id === panelId)
    return panel ? panel.tabIds : []
  }

  // 获取当前右键菜单所在面板实际显示的 tabIds（分屏时排除属于其他面板的 tab）
  const getRightClickedPanelTabIds = (): string[] => {
    const panelId = rightClickedPanelId.value
    if (panelId === 'panel-0') {
      // panel-0 在分屏时，tabIds 仍包含所有 tab，需要用 getPanel0Tabs 过滤
      return getPanel0Tabs().map((t) => t.id.toString())
    }
    const panel = splitState.panels.find((p) => p.id === panelId)
    return panel ? panel.tabIds : []
  }

  // 计算某个面板是否有已连接的 tab
  // connectionChangeCounter 作为强制刷新依赖，解决 comTerminalRefs 中 isConnected 变化
  // 无法被 reactive 深层追踪的问题（组件实例上的属性不是响应式的）
  const panelHasAnyConnected = computed<Record<string, boolean>>(() => {
    // 依赖此 counter 驱动重新计算
    void connectionChangeCounter.value
    const result: Record<string, boolean> = {}
    for (const panel of splitState.panels) {
      const displayTabIds = getPanelDisplayTabIds(panel.id)
      result[panel.id] = displayTabIds.some((tabId) => {
        const tab = connectionTabs.value.find((t) => t.id.toString() === tabId)
        if (!tab) return false
        return getConnectionStatus(tab) === 'connected'
      })
    }
    return result
  })

  const getPanelHasAnyConnected = (panelId: string): boolean => {
    return panelHasAnyConnected.value[panelId] ?? false
  }

  // 判断右键菜单是否应该在指定面板显示
  // 两个面板共享 showTabMenu ref，但只有右键所在面板才应显示菜单
  // 否则 panel-1 的菜单会覆盖 panel-0 的菜单（DOM 中 panel-1 在后面）
  const isPanelShowTabMenu = (panelId: string): boolean => {
    return showTabMenu.value && rightClickedPanelId.value === panelId
  }

  /**
   * 检查并合并空面板：如果 panel-0 实际显示无 tab，或只剩一个面板，自动取消分屏
   */
  const checkAndMergeEmptyPanels = (): void => {
    // 移除所有空面板（非 panel-0）
    for (let i = splitState.panels.length - 1; i >= 1; i--) {
      if (splitState.panels[i].tabIds.length === 0) {
        splitState.panels.splice(i, 1)
      }
    }

    // 如果 panel-0 实际显示无 tab（分屏时排除属于其他面板的 tab 后为空），则合并
    if (splitState.panels.length > 1) {
      const panel0DisplayTabs = getPanel0Tabs()
      if (panel0DisplayTabs.length === 0) {
        // panel-0 显示为空，移除 panel-0，右侧面板成为唯一面板
        splitState.panels.splice(0, 1) // 移除 panel-0
        // 重新编号：第一个面板改名为 panel-0
        if (splitState.panels.length > 0) {
          splitState.panels[0].id = 'panel-0'
          if (!splitState.panels[0].activeTabId && splitState.panels[0].tabIds.length > 0) {
            splitState.panels[0].activeTabId = splitState.panels[0].tabIds[0]
          }
        }
      }
    }

    // 如果只剩一个面板，取消分屏
    if (splitState.panels.length === 1) {
      splitState.splitRatio = 1
    }
  }

  // 当 connectionTabs 变化时，同步 tabIds 到面板
  watch(
    connectionTabs,
    (tabs) => {
      const allIds = tabs.map((t) => t.id.toString())

      // 从所有面板中清理已关闭的 tab
      for (const panel of splitState.panels) {
        for (let i = panel.tabIds.length - 1; i >= 0; i--) {
          if (!allIds.includes(panel.tabIds[i])) {
            panel.tabIds.splice(i, 1)
          }
        }
        // 如果 activeTabId 对应的 tab 已关闭，切换为第一个
        if (panel.activeTabId && !allIds.includes(panel.activeTabId)) {
          panel.activeTabId = panel.tabIds.length > 0 ? panel.tabIds[0] : ''
        }
      }

      // panel-0 始终包含所有 tab（新增的 tab 自动添加到 panel-0）
      if (splitState.panels.length > 0) {
        const panel0 = splitState.panels[0]
        const currentIds = new Set(panel0.tabIds)
        for (const id of allIds) {
          if (!currentIds.has(id)) {
            panel0.tabIds.push(id)
          }
        }
        if (!panel0.activeTabId && panel0.tabIds.length > 0) {
          panel0.activeTabId = panel0.tabIds[0]
        }
      }

      // 检查并合并空面板
      checkAndMergeEmptyPanels()
    },
    { immediate: true, deep: true }
  )

  // 当通过快捷键切换 tab 时，也需要同步到分屏面板
  watch(activeTabId, (newTabId: string) => {
    if (splitState.panels.length > 0 && newTabId) {
      const idStr = newTabId.toString()
      // 分屏时：优先在非 panel-0 的面板中查找（因为 panel-0 包含所有 tab）
      if (splitState.panels.length > 1) {
        for (let i = splitState.panels.length - 1; i >= 1; i--) {
          if (splitState.panels[i].tabIds.includes(idStr)) {
            splitState.panels[i].activeTabId = idStr
            return
          }
        }
      }
      // 在 panel-0 中查找
      if (splitState.panels[0].tabIds.includes(idStr)) {
        splitState.panels[0].activeTabId = idStr
        return
      }
      // tab 不在任何面板中，添加到 panel-0
      splitState.panels[0].activeTabId = idStr
      if (!splitState.panels[0].tabIds.includes(idStr)) {
        splitState.panels[0].tabIds.push(idStr)
      }
    }
  })

  // ---- 分屏面板限定的右键菜单命令 ----

  const disconnectAllTabsForPanel = async (): Promise<void> => {
    const panelTabIds = new Set(getRightClickedPanelTabIds())
    for (const tab of connectionTabs.value) {
      if (!panelTabIds.has(tab.id.toString())) continue
      if (tab.connectionType === 'com' && !comTerminalRefs[tab.id]?.isConnected) {
        // skip disconnected
      } else if (
        (tab.connectionType === 'telnet' || tab.connectionType === 'ftp') &&
        !telnetTerminalRefs[tab.id]?.isConnected
      ) {
        // skip disconnected
      } else {
        if (tab.connectionType === 'com') {
          comTerminalRefs[tab.id]?.preventAutoReconnect?.()
          comTerminalRefs[tab.id]?.disconnect?.()
        } else {
          telnetTerminalRefs[tab.id]?.preventAutoReconnect?.()
          telnetTerminalRefs[tab.id]?.disconnect?.()
        }
      }
    }
    hideTabMenu()
  }

  const connectAllTabsForPanel = async (): Promise<void> => {
    const panelTabIds = new Set(getRightClickedPanelTabIds())
    for (const tab of connectionTabs.value) {
      if (!panelTabIds.has(tab.id.toString())) continue
      if (tab.connectionType === 'com' && !comTerminalRefs[tab.id]?.isConnected) {
        comTerminalRefs[tab.id]?.reconnect?.()
      } else if (
        (tab.connectionType === 'telnet' || tab.connectionType === 'ftp') &&
        !telnetTerminalRefs[tab.id]?.isConnected
      ) {
        telnetTerminalRefs[tab.id]?.reconnect?.()
      }
    }
    hideTabMenu()
  }

  const closeOtherTabsForPanel = async (): Promise<void> => {
    if (!rightClickedTab.value) return
    const panelTabIds = new Set(getRightClickedPanelTabIds())
    const clickedId = rightClickedTab.value.id.toString()
    const tabsToClose = connectionTabs.value.filter(
      (t) => t.id.toString() !== clickedId && panelTabIds.has(t.id.toString())
    )
    for (const tab of tabsToClose) {
      await closeTabOnly(tab.id.toString())
    }
    hideTabMenu()
  }

  const closeLeftTabsForPanel = async (): Promise<void> => {
    if (!rightClickedTab.value) return
    const panelTabIds = new Set(getRightClickedPanelTabIds())
    const clickedId = rightClickedTab.value.id.toString()
    const currentIndex = connectionTabs.value.findIndex((t) => t.id.toString() === clickedId)
    const tabsToClose = connectionTabs.value
      .slice(0, currentIndex)
      .filter((t) => panelTabIds.has(t.id.toString()))
    for (const tab of tabsToClose) {
      await closeTabOnly(tab.id.toString())
    }
    hideTabMenu()
  }

  const closeRightTabsForPanel = async (): Promise<void> => {
    if (!rightClickedTab.value) return
    const panelTabIds = new Set(getRightClickedPanelTabIds())
    const clickedId = rightClickedTab.value.id.toString()
    const currentIndex = connectionTabs.value.findIndex((t) => t.id.toString() === clickedId)
    const tabsToClose = connectionTabs.value
      .slice(currentIndex + 1)
      .filter((t) => panelTabIds.has(t.id.toString()))
    for (const tab of tabsToClose) {
      await closeTabOnly(tab.id.toString())
    }
    hideTabMenu()
  }

  const closeAllTabsForPanel = async (): Promise<void> => {
    const panelTabIds = new Set(getRightClickedPanelTabIds())
    for (const tab of [...connectionTabs.value]) {
      if (panelTabIds.has(tab.id.toString())) {
        await closeTabOnly(tab.id.toString())
      }
    }
    hideTabMenu()
  }

  // ---- 分屏操作 ----

  const handleSplitToNewPanel = (): void => {
    if (!rightClickedTab.value) return
    const tabId = rightClickedTab.value.id.toString()

    // 如果已经是分屏状态，不允许再次分屏
    if (splitState.panels.length > 1) {
      hideTabMenu()
      return
    }

    // 如果当前只有一个 tab，不分屏
    const currentPanel = splitState.panels[0]
    if (currentPanel.tabIds.length <= 1) {
      hideTabMenu()
      return
    }

    // 创建新面板
    splitPanel('panel-0', 'horizontal')

    // 新面板：拥有右键的 tab
    const newPanel = splitState.panels[splitState.panels.length - 1]
    if (newPanel) {
      newPanel.activeTabId = tabId
      newPanel.tabIds = [tabId]
    }

    // panel-0 保留所有 tab（包括被分屏的 tab），组件实例不销毁
    // 被分屏的 tab 仍然在 panel-0.tabIds 中，但通过 getTabPanelId 判定属于 panel-1
    // 终端组件通过 Teleport 传送到 panel-1 的 terminal-area
    // 不需要从 panel-0 移除 tab

    // 切换 panel-0 到另一个 tab
    const srcPanel = splitState.panels[0]
    if (srcPanel.tabIds.length > 1) {
      // 找一个不在 panel-1 中的 tab
      const otherTab = srcPanel.tabIds.find((id) => id !== tabId)
      if (otherTab) {
        srcPanel.activeTabId = otherTab
      }
    }

    // 同步 activeTabId
    if (splitState.panels[0].activeTabId) {
      activeTabId.value = splitState.panels[0].activeTabId
    }

    hideTabMenu()
  }

  /**
   * 执行分屏：将指定 tab 移到新面板
   */
  const performSplitWithTab = (tabId: string, _sourcePanelId: string): void => {
    void _sourcePanelId // 来源面板在单面板模型下无实际意义（仅移动需要），保持签名对称
    const currentPanel = splitState.panels[0]
    if (currentPanel.tabIds.length <= 1) return

    // 创建新面板
    splitPanel('panel-0', 'horizontal')

    // 新面板：拥有被拖拽的 tab
    const newPanel = splitState.panels[splitState.panels.length - 1]
    if (newPanel) {
      newPanel.activeTabId = tabId
      newPanel.tabIds = [tabId]
    }

    // panel-0 切换到另一个 tab
    const srcPanel = splitState.panels[0]
    if (srcPanel.tabIds.length > 1) {
      const otherTab = srcPanel.tabIds.find((id) => id !== tabId)
      if (otherTab) {
        srcPanel.activeTabId = otherTab
      }
    }

    // 同步 activeTabId
    if (splitState.panels[0].activeTabId) {
      activeTabId.value = splitState.panels[0].activeTabId
    }
  }

  /**
   * 在已分屏状态下，移动 tab 到另一个面板
   */
  const moveTabToPanel = (tabId: string, sourcePanelId: string, targetZone: string): void => {
    // 找到源面板和目标面板
    const sourcePanel = splitState.panels.find((p) => p.id === sourcePanelId)
    if (!sourcePanel) return

    // 确定目标面板：如果 targetZone 是 'left'，目标为 panel-0；否则为第一个非 panel-0 面板
    let targetPanel: Panel | undefined
    if (targetZone === 'left') {
      targetPanel = splitState.panels[0]
    } else {
      // 找到与源面板不同的非 panel-0 面板（如果没有就用 panel-1）
      targetPanel = splitState.panels.find((p) => p.id !== sourcePanelId && p.id !== 'panel-0')
      if (!targetPanel) {
        targetPanel = splitState.panels.find((p) => p.id !== sourcePanelId)
      }
    }
    if (!targetPanel || targetPanel.id === sourcePanel.id) return

    // 从源面板移除（但 panel-0 保留所有 tab 作为备份，仅从非 panel-0 面板移除）
    if (sourcePanel.id !== 'panel-0') {
      const idx = sourcePanel.tabIds.indexOf(tabId)
      if (idx >= 0) sourcePanel.tabIds.splice(idx, 1)
    }

    // 添加到目标面板
    if (!targetPanel.tabIds.includes(tabId)) {
      targetPanel.tabIds.push(tabId)
    }
    targetPanel.activeTabId = tabId

    // 更新源面板的 activeTabId：如果拖走的是当前选中的 tab，自动选中第一个
    if (sourcePanel.activeTabId === tabId) {
      // panel-0 保留所有 tabIds（作为备份），需要用 getPanel0Tabs 过滤
      const sourceTabs =
        sourcePanel.id === 'panel-0'
          ? getPanel0Tabs()
          : sourcePanel.tabIds
              .map((id) => connectionTabs.value.find((t) => t.id.toString() === id))
              .filter(Boolean)
      sourcePanel.activeTabId = sourceTabs.length > 0 ? sourceTabs[0]!.id.toString() : ''
    }

    // 如果源面板（非 panel-0）变空，移除该面板
    if (sourcePanel.id !== 'panel-0' && sourcePanel.tabIds.length === 0) {
      const idx = splitState.panels.indexOf(sourcePanel)
      if (idx >= 0) splitState.panels.splice(idx, 1)
    }

    // 检查是否需要自动合并：panel-0 实际显示为空 或 只剩一个面板
    checkAndMergeEmptyPanels()

    // 同步 activeTabId
    if (splitState.panels[0]?.activeTabId) {
      activeTabId.value = splitState.panels[0].activeTabId
    }
  }

  /**
   * 拖拽 tab 到面板区域进行分屏/移动
   * @param tabId 被拖拽的 tab ID
   * @param sourcePanelId 来源面板 ID
   * @param targetZone 目标区域：'left' | 'right' | 'split-right'
   */
  const handleTabDropToPane = (tabId: string, sourcePanelId: string, targetZone: string): void => {
    const tab = connectionTabs.value.find((t) => t.id.toString() === tabId)
    if (!tab) return

    if (!isSplit.value && targetZone === 'split-right') {
      // 未分屏，拖到右侧 → 进行分屏
      performSplitWithTab(tabId, sourcePanelId)
    } else if (isSplit.value) {
      // 已分屏，拖到另一个面板 → 移动 tab 到该面板
      moveTabToPanel(tabId, sourcePanelId, targetZone)
    }
  }

  return {
    rightClickedPanelId,
    isSplit,
    isPanelShowTabMenu,
    checkAndMergeEmptyPanels,
    getTabPanelId,
    isTabActiveInItsPanel,
    getRightClickedPanelTabIds,
    getPanelDisplayTabIds,
    panelHasAnyConnected,
    getPanelHasAnyConnected,
    disconnectAllTabsForPanel,
    connectAllTabsForPanel,
    closeOtherTabsForPanel,
    closeLeftTabsForPanel,
    closeRightTabsForPanel,
    closeAllTabsForPanel,
    handleSplitToNewPanel,
    handleTabDropToPane,
    performSplitWithTab,
    moveTabToPanel,
    getPanelTabs,
    getPanel0Tabs
  }
}
