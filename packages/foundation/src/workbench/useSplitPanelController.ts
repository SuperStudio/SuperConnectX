/**
 * useSplitPanelController - 分屏面板通用 Tab 编排（基础层）
 *
 * 把「面板限定右键命令 / Tab 归属查询 / 拖拽分屏与移动 / 空面板自动合并 /
 * 面板状态同步」收敛为与业务无关的可组合控制器。它串联两个核心：
 * - useSplitWorkspace（分屏布局模型的读写）
 * - 宿主提供的 tabs 列表（激活 / 关闭语义经回调注入）
 *
 * 面板模型：panel-0 永远持有全部 tab（作为「备份」，保证组件实例不销毁）；
 * 分屏出的非 panel-0 面板持有「专属」tabIds。Tab 的实际归属判定：
 * 分屏时优先在非 panel-0 面板中查找，否则属于 panel-0。
 *
 * 业务专属能力（如终端连接/断开、连接状态感知）不属于本控制器，
 * 由宿主基于 getPanelTabs / getPanelDisplayTabIds 等原语自行组合。
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { Panel, SplitState } from './useSplitWorkspace'

export interface SplitPanelControllerOptions<T> {
  /** 全量 tab 列表（单一事实来源；新增 tab 自动归入 panel-0） */
  tabs: Ref<T[]>
  /** 从 tab 对象解析 id（应用侧 id 可能是 number / string） */
  getTabId: (tab: T) => string
  /** 全局激活 tab id（与 panel.activeTabId 双向同步） */
  activeTabId: Ref<string>
  splitState: SplitState
  splitPanel: (panelId: string, direction?: 'horizontal' | 'vertical') => void
  showTabMenu: Ref<boolean>
  /** 当前右键的 tab（菜单命令的锚点） */
  rightClickedTab: Ref<T | null>
  hideTabMenu: () => void
  /** 关闭单个 tab 的宿主实现（面板限定的批量关闭最终逐个走这里） */
  closeTab: (tabId: string) => void | Promise<void>
}

/** Public surface returned by {@link useSplitPanelController}. */
export interface SplitPanelController<T> {
  rightClickedPanelId: Ref<string>
  isSplit: ComputedRef<boolean>
  isPanelShowTabMenu: (panelId: string) => boolean
  checkAndMergeEmptyPanels: () => void
  getTabPanelId: (tabId: string) => string
  isTabActiveInItsPanel: (tabId: string) => boolean
  getRightClickedPanelTabIds: () => string[]
  getPanelDisplayTabIds: (panelId: string) => string[]
  getPanelTabs: (panel: { id: string; tabIds: string[] }) => T[]
  getPanel0Tabs: () => T[]
  closeOtherTabsForPanel: () => Promise<void>
  closeLeftTabsForPanel: () => Promise<void>
  closeRightTabsForPanel: () => Promise<void>
  closeAllTabsForPanel: () => Promise<void>
  handleSplitToNewPanel: () => void
  handleTabDropToPane: (tabId: string, sourcePanelId: string, targetZone: string) => void
  performSplitWithTab: (tabId: string, sourcePanelId: string) => void
  moveTabToPanel: (tabId: string, sourcePanelId: string, targetZone: string) => void
}

export function useSplitPanelController<T>(
  options: SplitPanelControllerOptions<T>
): SplitPanelController<T> {
  const {
    tabs,
    getTabId,
    activeTabId,
    splitState,
    splitPanel,
    showTabMenu,
    rightClickedTab,
    hideTabMenu,
    closeTab
  } = options

  // 记录右键菜单所在的面板 ID
  const rightClickedPanelId = ref('panel-0')

  // 当前是否处于分屏状态
  const isSplit = computed(() => splitState.panels.length > 1)

  // 获取 panel-0 的 tabs（排除已分屏到其他面板的 tab）
  const getPanel0Tabs = (): T[] => {
    if (splitState.panels.length <= 1) {
      // 单面板：显示所有 tab
      return tabs.value
    }
    // 分屏时：排除属于其他面板的 tab
    const otherTabIds = new Set<string>()
    for (let i = 1; i < splitState.panels.length; i++) {
      for (const id of splitState.panels[i].tabIds) {
        otherTabIds.add(id)
      }
    }
    return tabs.value.filter((t) => !otherTabIds.has(getTabId(t)))
  }

  // 获取某个面板拥有的 tabs（过滤 tabs）
  const getPanelTabs = (panel: { id: string; tabIds: string[] }): T[] => {
    const tabIdSet = new Set(panel.tabIds)
    return tabs.value.filter((t) => tabIdSet.has(getTabId(t)))
  }

  // 获取 tab 所属的面板 ID
  // 优先级：分屏时非 panel-0 优先（因为 panel-0 保留所有 tab 作为「备份」）
  // 非分屏时所有 tab 属于 panel-0
  const getTabPanelId = (tabId: string): string => {
    if (isSplit.value) {
      // 分屏时，检查非 panel-0 的面板（它们的 tabIds 是「专属」列表）
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
      return getPanel0Tabs().map(getTabId)
    }
    const panel = splitState.panels.find((p) => p.id === panelId)
    return panel ? panel.tabIds : []
  }

  // 获取当前右键菜单所在面板实际显示的 tabIds（分屏时排除属于其他面板的 tab）
  const getRightClickedPanelTabIds = (): string[] => {
    return getPanelDisplayTabIds(rightClickedPanelId.value)
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

  // 当 tabs 变化时，同步 tabIds 到面板
  watch(
    tabs,
    (currentTabs) => {
      const allIds = currentTabs.map(getTabId)

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

  // 当激活 tab 变化时，同步到分屏面板
  watch(activeTabId, (newTabId: string) => {
    if (splitState.panels.length > 0 && newTabId) {
      // 分屏时：优先在非 panel-0 的面板中查找（因为 panel-0 包含所有 tab）
      if (splitState.panels.length > 1) {
        for (let i = splitState.panels.length - 1; i >= 1; i--) {
          if (splitState.panels[i].tabIds.includes(newTabId)) {
            splitState.panels[i].activeTabId = newTabId
            return
          }
        }
      }
      // 在 panel-0 中查找
      if (splitState.panels[0].tabIds.includes(newTabId)) {
        splitState.panels[0].activeTabId = newTabId
        return
      }
      // tab 不在任何面板中，添加到 panel-0
      splitState.panels[0].activeTabId = newTabId
      if (!splitState.panels[0].tabIds.includes(newTabId)) {
        splitState.panels[0].tabIds.push(newTabId)
      }
    }
  })

  // ---- 分屏面板限定的右键菜单命令 ----

  const closeOtherTabsForPanel = async (): Promise<void> => {
    const clicked = rightClickedTab.value
    if (!clicked) return
    const panelTabIds = new Set(getRightClickedPanelTabIds())
    const clickedId = getTabId(clicked)
    const tabsToClose = tabs.value.filter(
      (t) => getTabId(t) !== clickedId && panelTabIds.has(getTabId(t))
    )
    for (const tab of tabsToClose) {
      await closeTab(getTabId(tab))
    }
    hideTabMenu()
  }

  const closeLeftTabsForPanel = async (): Promise<void> => {
    const clicked = rightClickedTab.value
    if (!clicked) return
    const panelTabIds = new Set(getRightClickedPanelTabIds())
    const clickedId = getTabId(clicked)
    const currentIndex = tabs.value.findIndex((t) => getTabId(t) === clickedId)
    const tabsToClose = tabs.value
      .slice(0, currentIndex)
      .filter((t) => panelTabIds.has(getTabId(t)))
    for (const tab of tabsToClose) {
      await closeTab(getTabId(tab))
    }
    hideTabMenu()
  }

  const closeRightTabsForPanel = async (): Promise<void> => {
    const clicked = rightClickedTab.value
    if (!clicked) return
    const panelTabIds = new Set(getRightClickedPanelTabIds())
    const clickedId = getTabId(clicked)
    const currentIndex = tabs.value.findIndex((t) => getTabId(t) === clickedId)
    const tabsToClose = tabs.value
      .slice(currentIndex + 1)
      .filter((t) => panelTabIds.has(getTabId(t)))
    for (const tab of tabsToClose) {
      await closeTab(getTabId(tab))
    }
    hideTabMenu()
  }

  const closeAllTabsForPanel = async (): Promise<void> => {
    const panelTabIds = new Set(getRightClickedPanelTabIds())
    for (const tab of [...tabs.value]) {
      if (panelTabIds.has(getTabId(tab))) {
        await closeTab(getTabId(tab))
      }
    }
    hideTabMenu()
  }

  // ---- 分屏操作 ----

  const handleSplitToNewPanel = (): void => {
    const clicked = rightClickedTab.value
    if (!clicked) return
    const tabId = getTabId(clicked)

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
    // 内容组件通过 Teleport 传送到 panel-1 的内容区域
    // 不需要从 panel-0 移除 tab

    // 切换 panel-0 到另一个 tab
    const srcPanel = splitState.panels[0]
    if (srcPanel.tabIds.length > 1) {
      // 找一个不在新面板中的 tab
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
              .map((id) => tabs.value.find((t) => getTabId(t) === id))
              .filter(Boolean)
      sourcePanel.activeTabId = sourceTabs.length > 0 ? getTabId(sourceTabs[0]!) : ''
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
   * @param targetZone 目标区域：'left' | 'right' | 'split-right'（后两者未分屏时均视为分屏）
   */
  const handleTabDropToPane = (tabId: string, sourcePanelId: string, targetZone: string): void => {
    const tab = tabs.value.find((t) => getTabId(t) === tabId)
    if (!tab) return

    if (!isSplit.value && (targetZone === 'right' || targetZone === 'split-right')) {
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
    getPanelTabs,
    getPanel0Tabs,
    closeOtherTabsForPanel,
    closeLeftTabsForPanel,
    closeRightTabsForPanel,
    closeAllTabsForPanel,
    handleSplitToNewPanel,
    handleTabDropToPane,
    performSplitWithTab,
    moveTabToPanel
  }
}
