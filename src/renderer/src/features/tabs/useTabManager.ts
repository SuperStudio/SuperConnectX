/**
 * useTabManager - 连接工作区选项卡管理器（业务层）
 *
 * 基于 foundation/workbench/useWorkbenchTabs 纯标签核心（列表/激活/固定/
 * 右键菜单/排序/移除），在此之上叠加本应用的会话业务语义：
 * - 各类型连接/工具页 Tab 的打开（含单例去重）
 * - 连接状态查询、全部连接/断开
 * - 关闭时的资源清理与 IPC 断开
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { fromRawConnection } from '../connections/protocol'
import { useWorkbenchTabs } from '../../foundation/workbench/useWorkbenchTabs'
import type { ComTerminalRef, TelnetTerminalRef } from './types'

export interface TabItem {
  id: string
  connectionType: string
  sessionId: string | number
  name?: string
  host?: string
  comName?: string
  port?: number
  connectionId?: number
  editorConnectionType?: string
  [key: string]: any
}

export function useTabManager(
  comTerminalRefs: Record<string, ComTerminalRef>,
  telnetTerminalRefs: Record<string, TelnetTerminalRef>
) {
  const { t } = useI18n()

  // ---- 纯标签核心：列表/激活/固定/右键菜单/排序/移除 ----
  const core = useWorkbenchTabs<TabItem>()
  const connectionTabs = core.tabs
  const activeTabId = core.activeTabId
  const pinnedTabs = core.pinnedTabs
  const showTabMenu = core.showTabMenu
  const tabMenuPosition = core.tabMenuPosition
  const rightClickedTab = core.rightClickedTab

  // 纯核心的别名（保持本层既有调用名）
  const switchTabById = core.activate
  const handleTabContextMenu = core.openTabContextMenu
  const handleTabsNavContextMenu = core.openNavTabContextMenu
  const hideTabMenu = core.hideTabMenu
  const reorderTabs = core.reorderTabs
  const moveTabToFirst = core.moveTabToFirst
  const moveTabToLast = core.moveTabToLast
  const togglePinTab = core.togglePinContext

  // ---- 连接状态 ----
  const getConnectionStatus = (tab: TabItem) => {
    if (tab.connectionType === 'com') {
      return comTerminalRefs[tab.id]?.isConnected ? 'connected' : 'disconnected'
    }
    return telnetTerminalRefs[tab.id]?.isConnected ? 'connected' : 'disconnected'
  }

  const hasAnyConnected = computed(() => {
    return connectionTabs.value.some((tab) => {
      if (tab.connectionType === 'com') {
        return comTerminalRefs[tab.id]?.isConnected
      } else if (tab.connectionType === 'telnet' || tab.connectionType === 'ftp') {
        return telnetTerminalRefs[tab.id]?.isConnected
      }
      return false
    })
  })

  // ---- 连接/断开全部 ----
  const connectAllTabs = async () => {
    for (const tab of connectionTabs.value) {
      if (tab.connectionType === 'com' && !comTerminalRefs[tab.id]?.isConnected) {
        comTerminalRefs[tab.id]?.reconnect?.()
      } else if ((tab.connectionType === 'telnet' || tab.connectionType === 'ftp') && !telnetTerminalRefs[tab.id]?.isConnected) {
        telnetTerminalRefs[tab.id]?.reconnect?.()
      }
    }
    hideTabMenu()
  }

  const disconnectAllTabs = async () => {
    for (const tab of connectionTabs.value) {
      const isConnected = tab.connectionType === 'com'
        ? comTerminalRefs[tab.id]?.isConnected
        : telnetTerminalRefs[tab.id]?.isConnected
      if (isConnected) {
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

  // ---- 关闭 Tab（纯核心仅负责最终移除，这里负责会话资源清理） ----
  const closeTabOnly = async (tabId: string) => {
    if (pinnedTabs.has(tabId)) return
    const tab = connectionTabs.value.find((t) => t.id === tabId)
    if (!tab) return

    // 禁止自动重连 + 断开连接（需要 await 确保 onDisconnect 事件链完成）
    if (tab.connectionType === 'ftp' || tab.connectionType === 'telnet') {
      telnetTerminalRefs[tabId]?.preventAutoReconnect?.()
      telnetTerminalRefs[tabId]?.cleanup?.()
    } else if (tab.connectionType === 'com') {
      comTerminalRefs[tabId]?.preventAutoReconnect?.()
      await comTerminalRefs[tabId]?.disconnect?.()
    }

    // 断开连接（IPC）
    const stopPayload = JSON.parse(JSON.stringify({
      ...fromRawConnection(tab),
      sessionId: tab.sessionId
    }))
    await window.connectApi.stopConnect(stopPayload).catch(() => {})

    // 列表移除 + 固定标记清除 + 激活回退由纯核心完成
    core.removeTab(tabId)
  }

  const closeTab = async (tabId: string, force = false) => {
    if (pinnedTabs.has(tabId) && !force) {
      ElMessage.warning(t('tabs.tabPinned'))
      return
    }
    const tab = connectionTabs.value.find((t) => t.id === tabId)
    if (tab) {
      if (tab.connectionType === 'ftp' || tab.connectionType === 'telnet') {
        telnetTerminalRefs[tabId]?.cleanup?.()
      } else if (tab.connectionType === 'com') {
        comTerminalRefs[tabId]?.preventAutoReconnect?.()
        await comTerminalRefs[tabId]?.disconnect?.()
      }

      const stopPayload = JSON.parse(JSON.stringify({
        ...fromRawConnection(tab),
        sessionId: tab.sessionId
      }))
      await window.connectApi.stopConnect(stopPayload)
    }
    core.removeTab(tabId)
  }

  const closeSingleTab = async (tab: TabItem) => {
    if (pinnedTabs.has(tab.id)) {
      hideTabMenu()
      return
    }
    await closeTab(tab.id.toString(), true)
    hideTabMenu()
  }

  const closeOtherTabs = async () => {
    if (!rightClickedTab.value) return
    const tabsToClose = connectionTabs.value.filter(t => t.id !== rightClickedTab.value!.id)
    for (const tab of tabsToClose) {
      await closeTabOnly(tab.id.toString())
    }
    hideTabMenu()
  }

  const closeLeftTabs = async () => {
    if (!rightClickedTab.value) return
    const currentIndex = connectionTabs.value.findIndex(t => t.id === rightClickedTab.value!.id)
    const tabsToClose = connectionTabs.value.slice(0, currentIndex)
    for (const tab of tabsToClose) {
      await closeTabOnly(tab.id.toString())
    }
    hideTabMenu()
  }

  const closeRightTabs = async () => {
    if (!rightClickedTab.value) return
    const currentIndex = connectionTabs.value.findIndex(t => t.id === rightClickedTab.value!.id)
    const tabsToClose = connectionTabs.value.slice(currentIndex + 1)
    for (const tab of tabsToClose) {
      await closeTabOnly(tab.id.toString())
    }
    hideTabMenu()
  }

  const closeAllTabs = async () => {
    for (const tab of [...connectionTabs.value]) {
      await closeTabOnly(tab.id.toString())
    }
    hideTabMenu()
  }

  // ---- 固定/取消固定 ----
  // 按钮场景（固定区域上的图钉）：固定中 → 取消固定；否则按原语义关闭该 Tab
  const togglePinTabByButton = (tabId: string | number) => {
    const id = tabId.toString()
    const isPinned = connectionTabs.value.some(t => t.id.toString() === id && pinnedTabs.has(t.id))
    if (isPinned) {
      core.togglePin(id)
    } else {
      void closeTabOnly(id)
    }
  }

  // ---- 打开 Tab ----
  const connectToServer = async (conn: any) => {
    const sessionId = Date.now() + Math.floor(Math.random() * 1000)
    const newTab: TabItem = {
      ...fromRawConnection(conn),
      sessionId: sessionId,
      id: `${conn.id}-${sessionId}`,
      connectionId: conn.id
    }
    connectionTabs.value.push(newTab)
    activeTabId.value = newTab.id.toString()
  }

  const connectToSerialPort = async (port: SerialPortInfo) => {
    const existingTab = connectionTabs.value.find((t) => t.comName === port.path && t.connectionType === 'com')
    if (existingTab) {
      activeTabId.value = existingTab.id
      setTimeout(() => {
        comTerminalRefs[existingTab.id]?.reconnect?.()
      }, 100)
      return
    }
    const sessionId = port.path
    const newTabId = `com-${sessionId}`
    const newTab: TabItem = {
      connectionType: 'com',
      name: port.path,
      comName: port.path,
      baudRate: 9600,
      host: '',
      port: 0,
      username: '',
      password: '',
      sessionId: sessionId,
      id: newTabId
    }
    connectionTabs.value.push(newTab)
    activeTabId.value = newTabId
  }

  const openCommandEditorTab = (connectionType: string = 'telnet') => {
    const typeDisplayName = connectionType.toUpperCase()
    const existingTab = connectionTabs.value.find(
      (t) => t.connectionType === 'commandEditor' && t.name === `编辑命令-${typeDisplayName}`
    )
    if (existingTab) {
      activeTabId.value = existingTab.id
      return
    }
    const newTabId = 'commandEditor-' + Date.now()
    connectionTabs.value.push({
      connectionType: 'commandEditor',
      name: `编辑命令-${typeDisplayName}`,
      editorConnectionType: connectionType,
      id: newTabId,
      sessionId: newTabId
    })
    activeTabId.value = newTabId
  }

  const openShortcutsTab = () => {
    const existingTab = connectionTabs.value.find((t) => t.connectionType === 'shortcuts')
    if (existingTab) { activeTabId.value = existingTab.id; return }
    const newTabId = 'shortcuts-' + Date.now()
    connectionTabs.value.push({ connectionType: 'shortcuts', name: '快捷键', id: newTabId, sessionId: newTabId })
    activeTabId.value = newTabId
  }

  const openSettingsTab = () => {
    const existingTab = connectionTabs.value.find((t) => t.connectionType === 'settings')
    if (existingTab) { activeTabId.value = existingTab.id; return }
    const newTabId = 'settings-' + Date.now()
    connectionTabs.value.push({ connectionType: 'settings', name: '设置', id: newTabId, sessionId: newTabId })
    activeTabId.value = newTabId
  }

  const openVirtualPortTab = () => {
    const existingTab = connectionTabs.value.find((t) => t.connectionType === 'virtualPort')
    if (existingTab) { activeTabId.value = existingTab.id; return }
    const newTabId = 'virtualPort-' + Date.now()
    connectionTabs.value.push({ connectionType: 'virtualPort', name: '虚拟串口模拟', id: newTabId, sessionId: newTabId })
    activeTabId.value = newTabId
  }

  return {
    connectionTabs,
    activeTabId,
    pinnedTabs,
    showTabMenu,
    tabMenuPosition,
    rightClickedTab,
    switchTabById,
    handleTabContextMenu,
    handleTabsNavContextMenu,
    hideTabMenu,
    getConnectionStatus,
    hasAnyConnected,
    connectAllTabs,
    disconnectAllTabs,
    closeTabOnly,
    closeTab,
    closeSingleTab,
    closeOtherTabs,
    closeLeftTabs,
    closeRightTabs,
    closeAllTabs,
    reorderTabs,
    moveTabToFirst,
    moveTabToLast,
    togglePinTabByButton,
    togglePinTab,
    connectToServer,
    connectToSerialPort,
    openCommandEditorTab,
    openShortcutsTab,
    openSettingsTab,
    openVirtualPortTab
  }
}
