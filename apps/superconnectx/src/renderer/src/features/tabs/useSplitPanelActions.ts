/**
 * useSplitPanelActions - 分屏面板中的业务 Tab 动作编排（业务层）
 *
 * 通用编排（面板归属查询 / 拖拽分屏与移动 / 空面板自动合并 /
 * 面板限定关闭 / 面板状态同步）已下沉至基础层：
 * foundation/workbench/useSplitPanelController
 *
 * 本文件只保留 SuperConnectX 业务专属部分：
 * - 面板连接状态感知（panelHasAnyConnected，经 getConnectionStatus 注入）
 * - 面板级连接 / 断开全部终端（经 comTerminalRefs / telnetTerminalRefs 操作终端实例）
 */
import { computed, type ComputedRef, type Ref } from 'vue'
import type { TabItem } from './useTabManager'
import type { ComTerminalRef, TelnetTerminalRef } from './types'
import { useSplitPanelController } from '@superx/foundation/workbench/useSplitPanelController'
import type { SplitPanelController } from '@superx/foundation/workbench/useSplitPanelController'
import type { SplitState } from '@superx/foundation/workbench/useSplitWorkspace'

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
export interface SplitPanelActionsController
  extends Omit<
    SplitPanelController<TabItem>,
    'closeOtherTabsForPanel' | 'closeLeftTabsForPanel' | 'closeRightTabsForPanel' | 'closeAllTabsForPanel'
  > {
  panelHasAnyConnected: ComputedRef<Record<string, boolean>>
  getPanelHasAnyConnected: (panelId: string) => boolean
  disconnectAllTabsForPanel: () => Promise<void>
  connectAllTabsForPanel: () => Promise<void>
  // 业务侧关闭需走 closeTabOnly（含断开连接等业务语义），签名保持异步
  closeOtherTabsForPanel: () => Promise<void>
  closeLeftTabsForPanel: () => Promise<void>
  closeRightTabsForPanel: () => Promise<void>
  closeAllTabsForPanel: () => Promise<void>
}

export function useSplitPanelActions(
  options: SplitPanelActionsOptions
): SplitPanelActionsController {
  const {
    connectionTabs,
    splitState,
    showTabMenu,
    rightClickedTab,
    hideTabMenu,
    closeTabOnly,
    getConnectionStatus,
    comTerminalRefs,
    telnetTerminalRefs,
    connectionChangeCounter
  } = options

  // 基础层通用控制器：面板归属 / 分屏 / 移动 / 合并 / 关闭编排
  const controller = useSplitPanelController<TabItem>({
    tabs: connectionTabs,
    getTabId: (tab) => tab.id.toString(),
    activeTabId: options.activeTabId,
    splitState,
    splitPanel: options.splitPanel,
    showTabMenu,
    rightClickedTab,
    hideTabMenu,
    closeTab: closeTabOnly
  })

  const {
    getPanelDisplayTabIds,
    getRightClickedPanelTabIds,
    closeOtherTabsForPanel,
    closeLeftTabsForPanel,
    closeRightTabsForPanel,
    closeAllTabsForPanel
  } = controller

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

  // ---- 分屏面板限定的连接 / 断开（业务专属） ----

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

  return {
    ...controller,
    panelHasAnyConnected,
    getPanelHasAnyConnected,
    disconnectAllTabsForPanel,
    connectAllTabsForPanel,
    // 显式保留（覆盖展开顺序，语义与上方解构一致）
    closeOtherTabsForPanel,
    closeLeftTabsForPanel,
    closeRightTabsForPanel,
    closeAllTabsForPanel
  }
}
