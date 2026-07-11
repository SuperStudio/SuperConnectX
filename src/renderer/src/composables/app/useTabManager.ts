/**
 * useTabManager - 选项卡管理器
 * 管理：选项卡 CRUD、固定/取消固定、右键菜单、排序、关闭逻辑
 */
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { fromRawConnection } from '../../entity/protocol'
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

  const connectionTabs = ref<TabItem[]>([])
  const activeTabId = ref('')
  const pinnedTabs = reactive<Set<string>>(new Set())

  // 右键菜单状态
  const showTabMenu = ref(false)
  const tabMenuPosition = ref({ x: 0, y: 0 })
  const rightClickedTab = ref<TabItem | null>(null)

  const switchTabById = (tabId: string | number) => {
    activeTabId.value = tabId.toString()
  }

  // ---- 右键菜单 ----
  const handleTabContextMenu = (e: MouseEvent, tab: TabItem) => {
    e.preventDefault()
    e.stopPropagation()
    rightClickedTab.value = tab
    tabMenuPosition.value = { x: e.clientX, y: e.clientY }
    showTabMenu.value = true
  }

  const handleTabsNavContextMenu = (e: MouseEvent) => {
    const tabEl = (e.target as HTMLElement).closest('.tab-item')
    if (tabEl) {
      const tabId = tabEl.getAttribute('data-tab-id')
      const tab = connectionTabs.value.find(t => t.id === tabId)
      if (tab) {
        handleTabContextMenu(e, tab)
      }
    } else if (showTabMenu.value) {
      e.preventDefault()
      hideTabMenu()
    }
  }

  const hideTabMenu = () => {
    showTabMenu.value = false
    rightClickedTab.value = null
  }

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

  // ---- 关闭 Tab ----
  const closeTabOnly = async (tabId: string) => {
    if (pinnedTabs.has(tabId)) return
    const tab = connectionTabs.value.find((t) => t.id === tabId)
    if (!tab) return

    // 禁止自动重连 + 断开连接（需要 await 确保 onDisconnect 事件链完成）
    if (tab.connectionType === 'ftp' || tab.connectionType === 'telnet') {
      telnetTerminalRefs[tabId]?.preventAutoReconnect?.()
    } else if (tab.connectionType === 'com') {
      comTerminalRefs[tabId]?.preventAutoReconnect?.()
      await comTerminalRefs[tabId]?.disconnect?.()
    }

    // 先从列表中移除
    connectionTabs.value = connectionTabs.value.filter((t) => t.id !== tabId)

    if (activeTabId.value === tabId && connectionTabs.value.length > 0) {
      activeTabId.value = connectionTabs.value[connectionTabs.value.length - 1].id.toString()
    }

    pinnedTabs.delete(tabId)

    // 断开连接
    const stopPayload = JSON.parse(JSON.stringify({
      ...fromRawConnection(tab),
      sessionId: tab.sessionId
    }))
    await window.connectApi.stopConnect(stopPayload).catch(() => {})
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

      pinnedTabs.delete(tabId)
    }
    connectionTabs.value = connectionTabs.value.filter((t) => t.id !== tabId)
    if (activeTabId.value === tabId.toString() && connectionTabs.value.length > 0) {
      activeTabId.value = connectionTabs.value[connectionTabs.value.length - 1].id.toString()
    }
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

  // ---- 拖拽排序 ----
  /**
   * 获取目标拖拽插入位置
   * @param fromId 被拖拽的 tab id
   * @param targetId 目标位置上的 tab id（释放位置）
   * @returns 插入索引，-1 表示不合法
   */
  const reorderTabs = (fromId: string, targetId: string, dropPosition: string = 'after') => {
    const fromIndex = connectionTabs.value.findIndex(t => t.id === fromId)
    let toIndex = connectionTabs.value.findIndex(t => t.id === targetId)
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return

    const isFromPinned = pinnedTabs.has(fromId)
    const isToPinned = pinnedTabs.has(targetId)

    // 固定标签和非固定标签不能交叉
    if (isFromPinned !== isToPinned) return

    const tab = connectionTabs.value.splice(fromIndex, 1)[0]
    // splice 后重新计算目标索引
    toIndex = connectionTabs.value.findIndex(t => t.id === targetId)
    // before: 插入到目标前面; after: 插入到目标后面
    const insertIndex = dropPosition === 'before' ? toIndex : toIndex + 1
    connectionTabs.value.splice(insertIndex, 0, tab)
  }

  // ---- 移动 Tab ----
  const moveTabToFirst = () => {
    if (!rightClickedTab.value) return
    const tabId = rightClickedTab.value.id
    const currentIndex = connectionTabs.value.findIndex(t => t.id === tabId)
    if (currentIndex === -1) return
    const isPinned = pinnedTabs.has(tabId)
    if (isPinned) {
      const firstPinnedIndex = connectionTabs.value.findIndex(t => pinnedTabs.has(t.id))
      if (currentIndex !== firstPinnedIndex) {
        const tab = connectionTabs.value.splice(currentIndex, 1)[0]
        connectionTabs.value.splice(firstPinnedIndex, 0, tab)
      }
    } else {
      let firstUnpinnedIndex = -1
      for (let i = 0; i < connectionTabs.value.length; i++) {
        if (!pinnedTabs.has(connectionTabs.value[i].id)) { firstUnpinnedIndex = i; break }
      }
      if (firstUnpinnedIndex === -1) firstUnpinnedIndex = connectionTabs.value.length
      if (currentIndex !== firstUnpinnedIndex) {
        const tab = connectionTabs.value.splice(currentIndex, 1)[0]
        connectionTabs.value.splice(firstUnpinnedIndex, 0, tab)
      }
    }
    hideTabMenu()
  }

  const moveTabToLast = () => {
    if (!rightClickedTab.value) return
    const tabId = rightClickedTab.value.id
    const currentIndex = connectionTabs.value.findIndex(t => t.id === tabId)
    if (currentIndex === -1) return
    const isPinned = pinnedTabs.has(tabId)
    if (isPinned) {
      let lastPinnedIndex = -1
      for (let i = connectionTabs.value.length - 1; i >= 0; i--) {
        if (pinnedTabs.has(connectionTabs.value[i].id)) { lastPinnedIndex = i; break }
      }
      if (currentIndex !== lastPinnedIndex) {
        const tab = connectionTabs.value.splice(currentIndex, 1)[0]
        connectionTabs.value.splice(lastPinnedIndex, 0, tab)
      }
    } else {
      let lastUnpinnedIndex = -1
      for (let i = connectionTabs.value.length - 1; i >= 0; i--) {
        if (!pinnedTabs.has(connectionTabs.value[i].id)) { lastUnpinnedIndex = i; break }
      }
      if (currentIndex !== lastUnpinnedIndex) {
        const tab = connectionTabs.value.splice(currentIndex, 1)[0]
        connectionTabs.value.splice(lastUnpinnedIndex, 0, tab)
      }
    }
    hideTabMenu()
  }

  // ---- 固定/取消固定 ----
  const getLastPinnedIndex = () => {
    let lastIndex = -1
    connectionTabs.value.forEach((tab, index) => {
      if (pinnedTabs.has(tab.id) && index > lastIndex) lastIndex = index
    })
    return lastIndex
  }

  const togglePinTabByButton = (tabId: string | number) => {
    const id = tabId.toString()
    const isPinned = connectionTabs.value.some(t => t.id.toString() === id && pinnedTabs.has(t.id))
    if (isPinned) {
      const currentIndex = connectionTabs.value.findIndex(t => t.id.toString() === id)
      if (currentIndex === -1) return
      const lastPinnedIndex = getLastPinnedIndex()
      pinnedTabs.delete(id)
      if (lastPinnedIndex >= 0 && currentIndex !== lastPinnedIndex) {
        const tab = connectionTabs.value.splice(currentIndex, 1)[0]
        connectionTabs.value.splice(lastPinnedIndex, 0, tab)
      }
    } else {
      closeTabOnly(id)
    }
  }

  const togglePinTab = () => {
    if (!rightClickedTab.value) return
    const tabId = rightClickedTab.value.id
    const id = tabId.toString()
    const currentIndex = connectionTabs.value.findIndex(t => t.id === id)
    if (currentIndex === -1) return
    if (pinnedTabs.has(id)) {
      const lastPinnedIndex = getLastPinnedIndex()
      pinnedTabs.delete(id)
      if (lastPinnedIndex >= 0 && currentIndex !== lastPinnedIndex) {
        const tab = connectionTabs.value.splice(currentIndex, 1)[0]
        connectionTabs.value.splice(lastPinnedIndex, 0, tab)
      }
    } else {
      const lastPinnedIndex = getLastPinnedIndex()
      pinnedTabs.add(id)
      if (lastPinnedIndex >= 0 && currentIndex !== lastPinnedIndex) {
        const tab = connectionTabs.value.splice(currentIndex, 1)[0]
        connectionTabs.value.splice(lastPinnedIndex + 1, 0, tab)
      } else if (lastPinnedIndex === -1 && currentIndex !== 0) {
        const tab = connectionTabs.value.splice(currentIndex, 1)[0]
        connectionTabs.value.unshift(tab)
      }
    }
    hideTabMenu()
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
    openSettingsTab
  }
}
