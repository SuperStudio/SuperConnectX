<template>
  <AppShell>
    <template #titlebar>
      <CustomTitleBar
        @toggle-primary-sidebar="toggleConnectionList"
        @toggle-bottom-panel="toggleBottomPanel"
        @refresh-commands="refreshHandler"
        @refresh-connections="loadConnections"
        @notify-import="handleImportNotify"
        @change-font="handleFontChange"
        :show-connection-list="showConnectionList"
        @change-font-size="handleFontSizeChange"
        @open-about="isAboutDialogOpen = true"
        :show-bottom-panel="showBottomPanel"
        @open-settings="openSettingsTab"
        :current-font="currentFont"
        @open-shortcuts="openShortcutsTab"
        :word-wrap="terminalWordWrap"
        @open-virtual-port="openVirtualPortTab"
        :line-numbers="terminalLineNumbers"
        @check-update="updateDialogRef?.open()"
        :log-editable="terminalLogEditable"
        @open-plugins="handlePlugins"
        @toggle-word-wrap="handleToggleWordWrap"
        @toggle-line-numbers="handleToggleLineNumbers"
        @toggle-log-editable="handleToggleLogEditable"
        @save-log-as="handleSaveLogAs"
      />
    </template>
    <NotifyContainer ref="notifyContainerRef" :default-duration="notificationDuration" />

    <div class="app-main">
      <!-- 侧边栏 -->
      <ConnectionSidebar
        :show-connection-list="showConnectionList"
        :sidebar-width="sidebarWidth"
        :serial-ports="serialPorts"
        :filtered-serial-ports="filteredSerialPorts"
        :serial-port-expanded="serialPortExpanded"
        :show-port-type="showPortType"
        :show-serial-port-friendly-name="showSerialPortFriendlyName"
        :show-serial-port-details="showSerialPortDetails"
        :connection-groups="connectionGroups"
        :connection-group-expanded="connectionGroupExpanded"
        :serial-remarks="serialRemarks"
        :connections="connections"
        :is-serial-port-connected="isSerialPortConnected"
        @open-create-dialog="openCreateDialog"
        @search="handleSearch"
        @load-serial-ports="loadSerialPorts"
        @connect-to-serial-port="connectToSerialPort"
        @disconnect-serial-port="disconnectSerialPort"
        @connect-to-server="connectToServer"
        @edit-create-dialog="editCreateDialog"
        @delete-connection="deleteConnection"
        @sidebar-menu-command="handleSidebarMenuCommand"
        @serial-port-context-menu="handleSerialPortContextMenu"
        @update:serial-port-expanded="(v) => (serialPortExpanded = v)"
      />

      <!-- 侧边栏分隔条 -->
      <SidebarResizeHandle
        v-if="showConnectionList"
        :resizing="isResizing"
        @resize-start="startResize"
      />

      <!-- 终端区域 -->
      <div class="terminal-wrapper" :class="{ expanded: !showConnectionList }">
        <!-- 无选项卡时的空状态 -->
        <div v-if="connectionTabs.length === 0" class="empty-tabs-placeholder">
          <div class="logo-container">
            <img :src="logoImage" alt="SuperStudio" class="logo-img" />
            <div class="logo-text">SuperStudio</div>
            <div class="copyright">&copy; 2025 SuperStudio</div>
          </div>
        </div>

        <!-- 分屏容器：SuperSplit 只负责布局 -->
        <SuperSplit
          v-else
          ref="superSplitRef"
          :is-split="splitState.panels.length > 1"
          :split-ratio="splitState.splitRatio"
          @update-split-ratio="updateSplitRatio"
          @tab-drop-to-pane="handleTabDropToPane"
        >
          <!-- 左面板：panel-0 -->
          <template #left>
            <TerminalPanel
              :ref="
                (el: any) => {
                  if (el) panelRefs['panel-0'] = el
                }
              "
              panel-id="panel-0"
              :panel-tabs="getPanel0Tabs()"
              :active-tab-id="splitState.panels[0].activeTabId || activeTabId"
              :pinned-tabs="pinnedTabs"
              :show-tab-menu="isPanelShowTabMenu('panel-0')"
              :tab-menu-position="tabMenuPosition"
              :right-clicked-tab="rightClickedTab"
              :has-any-connected="getPanelHasAnyConnected('panel-0')"
              :serial-remarks="serialRemarks"
              :get-connection-status="getConnectionStatus"
              @switch-tab="
                (id: any) => {
                  switchPanelTab('panel-0', id.toString())
                  originalSwitchTabById(id)
                }
              "
              @hide-tab-menu="hideTabMenu"
              @tabs-nav-context-menu="handleTabsNavContextMenu"
              @tab-context-menu="
                (e: any, tab: any) => {
                  rightClickedPanelId = 'panel-0'
                  handleTabContextMenu(e, tab)
                }
              "
              @toggle-pin-by-button="togglePinTabByButton"
              @disconnect-all="disconnectAllTabsForPanel"
              @connect-all="connectAllTabsForPanel"
              @close-single="closeSingleTab"
              @close-other="closeOtherTabsForPanel"
              @close-left="closeLeftTabsForPanel"
              @close-right="closeRightTabsForPanel"
              @close-all="closeAllTabsForPanel"
              @move-to-first="moveTabToFirst"
              @move-to-last="moveTabToLast"
              @reorder-tabs-with-pin="
                (fromId: any, targetId: any, pos: any, toPin: any) =>
                  reorderTabs(fromId, targetId, pos, toPin)
              "
              @split-to-new-panel="handleSplitToNewPanel"
              @toggle-pin="togglePinTab"
              @open-remark-dialog="openRemarkDialogHandler"
            >
              <!-- 终端组件通过 Teleport 从终端池传入，slot 为空 -->
            </TerminalPanel>
          </template>

          <!-- 右面板：分屏时渲染 -->
          <template v-if="splitState.panels.length > 1" #right>
            <TerminalPanel
              v-for="panel in splitState.panels.slice(1)"
              :key="panel.id"
              :ref="
                (el: any) => {
                  if (el) panelRefs[panel.id] = el
                }
              "
              :panel-id="panel.id"
              :panel-tabs="getPanelTabs(panel)"
              :active-tab-id="panel.activeTabId"
              :pinned-tabs="pinnedTabs"
              :show-tab-menu="isPanelShowTabMenu(panel.id)"
              :tab-menu-position="tabMenuPosition"
              :right-clicked-tab="rightClickedTab"
              :has-any-connected="getPanelHasAnyConnected(panel.id)"
              :serial-remarks="serialRemarks"
              :get-connection-status="getConnectionStatus"
              @switch-tab="
                (id: any) => {
                  switchPanelTab(panel.id, id.toString())
                  originalSwitchTabById(id)
                }
              "
              @hide-tab-menu="hideTabMenu"
              @tabs-nav-context-menu="handleTabsNavContextMenu"
              @tab-context-menu="
                (e: any, tab: any) => {
                  rightClickedPanelId = panel.id
                  handleTabContextMenu(e, tab)
                }
              "
              @toggle-pin-by-button="togglePinTabByButton"
              @disconnect-all="disconnectAllTabsForPanel"
              @connect-all="connectAllTabsForPanel"
              @close-single="closeSingleTab"
              @close-other="closeOtherTabsForPanel"
              @close-left="closeLeftTabsForPanel"
              @close-right="closeRightTabsForPanel"
              @close-all="closeAllTabsForPanel"
              @move-to-first="moveTabToFirst"
              @move-to-last="moveTabToLast"
              @reorder-tabs-with-pin="
                (fromId: any, targetId: any, pos: any, toPin: any) =>
                  reorderTabs(fromId, targetId, pos, toPin)
              "
              @split-to-new-panel="handleSplitToNewPanel"
              @toggle-pin="togglePinTab"
              @open-remark-dialog="openRemarkDialogHandler"
            >
            </TerminalPanel>
          </template>
        </SuperSplit>

        <!-- 终端组件池：所有终端组件在此渲染，通过 Teleport 分发到各面板 -->
        <div class="terminal-pool">
          <template v-for="tab in connectionTabs" :key="tab.id">
            <Teleport :to="`#terminal-area-${getTabPanelId(tab.id.toString())}`" :disabled="false">
              <ComTerminal
                v-if="tab.connectionType === 'com'"
                v-show="isTabActiveInItsPanel(tab.id.toString())"
                :ref="
                  (el: any) => {
                    if (el) comTerminalRefs[tab.id] = el
                  }
                "
                :connection="tab"
                :auto-connect="tab.wasConnected !== false"
                :show-bottom-panel="showBottomPanel"
                class="terminal-component"
                @on-close="handleTerminalClose(tab.id)"
                @command-sent="handleCommandSent"
                @on-connect="
                  () => {
                    if (tab.comName) connectedSerialPorts[tab.comName] = true
                  }
                "
                @on-disconnect="
                  () => {
                    if (tab.comName) delete connectedSerialPorts[tab.comName]
                  }
                "
                @open-command-editor="openCommandEditorTab"
                @open-syntax-highlight="openSettingsAndSwitchToSyntax"
                @remark-updated="
                  (data: any) => {
                    if (data.comName) serialRemarks[data.comName] = data.remark
                  }
                "
                @font-loaded="
                  (font: string) => {
                    currentFont = font
                  }
                "
              />
              <TelnetTerminal
                v-if="tab.connectionType === 'telnet' || tab.connectionType === 'ftp'"
                v-show="isTabActiveInItsPanel(tab.id.toString())"
                :ref="
                  (el: any) => {
                    if (el) telnetTerminalRefs[tab.id] = el
                  }
                "
                :connection="tab"
                :auto-connect="tab.wasConnected !== false"
                :show-bottom-panel="showBottomPanel"
                class="terminal-component"
                @on-close="handleTerminalClose(tab.id)"
                @command-sent="handleCommandSent"
                @open-command-editor="openCommandEditorTab"
                @open-syntax-highlight="openSettingsAndSwitchToSyntax"
                @font-loaded="
                  (font: string) => {
                    currentFont = font
                  }
                "
              />
              <CommandEditor
                v-if="tab.connectionType === 'commandEditor'"
                v-show="isTabActiveInItsPanel(tab.id.toString())"
                :connection-type="tab.editorConnectionType"
                class="terminal-component"
              />
              <ShortcutsPage
                v-if="tab.connectionType === 'shortcuts'"
                v-show="isTabActiveInItsPanel(tab.id.toString())"
                class="terminal-component"
              />
              <SettingsPage
                v-if="tab.connectionType === 'settings'"
                v-show="isTabActiveInItsPanel(tab.id.toString())"
                class="terminal-component"
              />
              <VirtualPortPage
                v-if="tab.connectionType === 'virtualPort'"
                v-show="isTabActiveInItsPanel(tab.id.toString())"
                class="terminal-component"
              />
            </Teleport>
          </template>
        </div>
      </div>
    </div>

    <!-- 状态栏 -->
    <template #statusbar>
      <StatusBar>
        <template #left
          ><div class="resource-monitor"><ResourceMonitor /></div
        ></template>
        <template #right
          ><div v-if="lastSentCommand" class="command-status">
            {{ t('notification.commandSent', { command: lastSentCommand }) }}
          </div></template
        >
      </StatusBar>
    </template>

    <!-- 弹窗 -->
    <ConnectionDialog ref="connectionDialogRef" @submit="handleConnectionSubmit" />
    <AboutDialog v-model:model-value="isAboutDialogOpen" />
    <UpdateDialog ref="updateDialogRef" v-model:model-value="isUpdateDialogOpen" />

    <!-- 串口备注弹窗 -->
    <SerialRemarkDialog
      v-model:visible="showRemarkDialog"
      v-model:remark="editingRemark"
      :com-name="editingRemarkComName"
      @opened="onRemarkDialogOpened"
      @save="saveSerialRemarkHandler"
    />
  </AppShell>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import CustomTitleBar from './components/CustomTitleBar.vue'
import NotifyContainer from './components/NotifyContainer.vue'
import ResourceMonitor from './components/ResourceMonitor.vue'
import AboutDialog from './components/AboutDialog.vue'
import UpdateDialog from './components/UpdateDialog.vue'
import ConnectionDialog from './features/connections/ConnectionDialog.vue'
import ConnectionSidebar from './features/connections/ConnectionSidebar.vue'
import TerminalPanel from './components/app/TerminalPanel.vue'
import SuperSplit from './components/app/SuperSplit.vue'
import SerialRemarkDialog from './features/connections/SerialRemarkDialog.vue'
import ComTerminal from './features/terminal/ComTerminal.vue'
import TelnetTerminal from './features/terminal/TelnetTerminal.vue'
import CommandEditor from './features/commands/CommandEditor.vue'
import ShortcutsPage from './components/ShortcutsPage.vue'
import SettingsPage from './components/SettingsPage.vue'
import VirtualPortPage from './features/virtual-port/VirtualPortPage.vue'
import AppShell from './foundation/shell/AppShell.vue'
import StatusBar from './foundation/shell/StatusBar.vue'
import SidebarResizeHandle from './foundation/shell/SidebarResizeHandle.vue'
import { useSidebarResize } from './foundation/shell/useSidebarResize'
import logoImage from './assets/icon.png'

// Composables
import { useConnectionSidebar } from './features/connections/useConnectionSidebar'
import { useTabManager } from './features/tabs/useTabManager'
import { useSplitWorkspace } from './foundation/workbench/useSplitWorkspace'
import { useSerialRemarks } from './features/connections/useSerialRemarks'
import { useShortcuts } from './features/shortcuts/useShortcuts'
import { useTerminalDisplay } from './features/terminal/useTerminalDisplay'
import { useFontManager } from './features/terminal/useFontManager'
import {
  loadTerminalDisplayText,
  initTerminalDisplayTextListener
} from './features/terminal/useTerminalDisplayText'
import { useConnectionDialog } from './features/connections/useConnectionDialog'
import { useSessionRestore } from './features/tabs/useSessionRestore'
import { useSplitPanelActions } from './features/tabs/useSplitPanelActions'
import { useConnectionStateMonitor } from './features/tabs/useConnectionStateMonitor'
import { useTerminalToolbarActions } from './features/terminal/useTerminalToolbarActions'
import { useTerminalEventNotifications } from './features/terminal/useTerminalEventNotifications'

const { t } = useI18n()

// ---- Refs ----
const notifyContainerRef = ref<InstanceType<typeof NotifyContainer> | null>(null)
const notificationDuration = ref(0)
const isAboutDialogOpen = ref(false)
const isUpdateDialogOpen = ref(false)
const updateDialogRef = ref<InstanceType<typeof UpdateDialog> | null>(null)

const connectedSerialPorts = reactive<Record<string, boolean>>({})
const comTerminalRefs = reactive<Record<string, any>>({})
const telnetTerminalRefs = reactive<Record<string, any>>({})

// ---- 连接状态监测（轮询终端实例 isConnected，驱动派生状态重算） ----
const {
  connectionChangeCounter,
  isConnected: isConnectedForSession,
  stopPolling: stopConnectionStatePolling
} = useConnectionStateMonitor({ comTerminalRefs, telnetTerminalRefs })

// SuperSplit & 面板 refs
// const superSplitRef = ref<InstanceType<typeof SuperSplit> | null>(null)  // 预留，暂未使用
const panelRefs = reactive<Record<string, InstanceType<typeof TerminalPanel> | null>>({})

// ---- Sidebar ----
const {
  connections,
  serialPorts,
  showConnectionList,
  showBottomPanel,
  sidebarWidth,
  serialPortExpanded,
  showPortType,
  showSerialPortFriendlyName,
  showSerialPortDetails,
  connectionGroupExpanded,
  filteredSerialPorts,
  connectionGroups,
  handleSearch,
  loadConnections,
  loadSerialPorts,
  loadSidebarState,
  handleSerialPortsChanged,
  toggleConnectionList,
  toggleBottomPanel
} = useConnectionSidebar()

// ---- Tab Manager ----
const {
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
  closeTab,
  closeTabOnly,
  closeSingleTab,
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
} = useTabManager(comTerminalRefs, telnetTerminalRefs)

// ---- Split Panel ----
const {
  splitState,
  splitPanel,
  // removePanel,  // 预留，handleMergePanel 中使用
  switchPanelTab,
  updateSplitRatio,
  onTabClosed
} = useSplitWorkspace()

// ---- 分屏面板动作编排（面板限定右键命令 / Tab 归属查询 / 拖拽分屏与移动 / 自动合并） ----
const {
  rightClickedPanelId,
  isPanelShowTabMenu,
  getTabPanelId,
  isTabActiveInItsPanel,
  getPanelHasAnyConnected,
  disconnectAllTabsForPanel,
  connectAllTabsForPanel,
  closeOtherTabsForPanel,
  closeLeftTabsForPanel,
  closeRightTabsForPanel,
  closeAllTabsForPanel,
  handleSplitToNewPanel,
  handleTabDropToPane,
  getPanelTabs,
  getPanel0Tabs
} = useSplitPanelActions({
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
})

// ---- Session Restore（会话恢复） ----
const sessionRestore = useSessionRestore({
  connectionTabs,
  activeTabId,
  pinnedTabs,
  splitState,
  isConnected: isConnectedForSession,
  connectionStateDependency: connectionChangeCounter
})

// ---- Serial Remarks ----
const {
  showRemarkDialog,
  editingRemark,
  editingRemarkComName,
  serialRemarks,
  loadAllSerialRemarks,
  openRemarkDialog,
  openSerialPortRemark,
  onRemarkDialogOpened,
  saveSerialRemark
} = useSerialRemarks(comTerminalRefs)

const openRemarkDialogHandler = async () => {
  if (!rightClickedTab.value?.comName) return
  await openRemarkDialog(rightClickedTab.value)
  hideTabMenu()
}

// 串口右键菜单处理
const handleSerialPortContextMenu = async (data: { event: MouseEvent; port: any }) => {
  await openSerialPortRemark(data.port.path)
}
const saveSerialRemarkHandler = () => {
  saveSerialRemark()
}

// ---- Connection Dialog ----
const connectionDialogRef = ref<InstanceType<typeof ConnectionDialog> | null>(null)
const { openCreateDialog, editCreateDialog, handleConnectionSubmit, deleteConnection } =
  useConnectionDialog(loadConnections, connectionDialogRef)

// ---- Terminal Display ----
const {
  terminalWordWrap,
  terminalLineNumbers,
  terminalLogEditable,
  loadTerminalDisplaySettings,
  saveTerminalDisplaySettings,
  applyToAllTerminals,
  applyTerminalDisplaySettingsToTab
} = useTerminalDisplay()

// ---- Terminal Toolbar Actions（工具栏终端动作编排：显示偏好切换 / 刷新分组命令 / 日志另存为） ----
const {
  handleToggleWordWrap,
  handleToggleLineNumbers,
  handleToggleLogEditable,
  refreshHandler,
  handleSaveLogAs
} = useTerminalToolbarActions({
  activeTabId,
  connectionTabs,
  comTerminalRefs,
  telnetTerminalRefs,
  terminalWordWrap,
  terminalLineNumbers,
  terminalLogEditable,
  applyToAllTerminals,
  saveTerminalDisplaySettings
})

// ---- Terminal Event Notifications（终端事件通知编排：命令发送 / 导入通知 / 日志切割 / 文本清空 / 自动滚动停止） ----
const {
  lastSentCommand,
  handleCommandSent,
  handleImportNotify,
  handleLogSplit,
  handleTerminalTextCleared,
  handleAutoScrollToast
} = useTerminalEventNotifications({
  notifyContainerRef,
  connectionTabs,
  comTerminalRefs,
  telnetTerminalRefs
})

// ---- Shortcuts ----
const { handleShortcutKeydown, loadShortcutActions, loadShortcuts, handleShortcutsUpdated } =
  useShortcuts(
    {
      openCreateDialog,
      closeSingleTab,
      toggleConnectionList,
      loadSerialPorts,
      openCommandEditorTab,
      openSettingsTab,
      togglePinTab,
      moveTabToFirst,
      moveTabToLast,
      openSettingsAndSwitchToSyntax: () => openSettingsAndSwitchToSyntax(),
      toggleWordWrap: handleToggleWordWrap
    },
    connectionTabs,
    activeTabId,
    hasAnyConnected,
    comTerminalRefs,
    telnetTerminalRefs,
    rightClickedTab,
    disconnectAllTabs,
    connectAllTabs,
    switchTabById,
    togglePinTab,
    moveTabToFirst,
    moveTabToLast
  )

// ---- Font Manager ----
const { currentFont, updateCurrentFont, handleFontChange, handleFontSizeChange } = useFontManager(
  activeTabId,
  comTerminalRefs,
  telnetTerminalRefs
)

// ---- Sidebar Resize ----
const { isResizing, startResize, stopResize } = useSidebarResize({
  width: sidebarWidth,
  visible: showConnectionList
})

// ---- 重写 switchTabById，同步到分屏面板 ----
const originalSwitchTabById = switchTabById

// ---- Watch: activeTabId -> 字体 + 显示设置 ----
watch(activeTabId, (newTabId: string, oldTabId: string) => {
  if (newTabId && newTabId !== oldTabId) {
    nextTick(() => {
      updateCurrentFont(newTabId)
      applyTerminalDisplaySettingsToTab(newTabId, comTerminalRefs, telnetTerminalRefs)
    })
  }
})

// ---- Watch: 串口列表变化 -> 加载备注 ----
watch(
  serialPorts,
  async (newPorts) => {
    for (const port of newPorts) {
      if (!serialRemarks[port.path]) {
        await loadAllSerialRemarks(newPorts)
        break
      }
    }
  },
  { immediate: true }
)

// ---- 工具栏/设置回调 ----
const handlePlugins = () => {
  ElMessage.info(t('notification.pluginsDeveloping'))
}

const openSettingsAndSwitchToSyntax = () => {
  const existingTab = connectionTabs.value.find((t) => t.connectionType === 'settings')
  openSettingsTab()
  if (existingTab) {
    window.dispatchEvent(new CustomEvent('open-syntax-highlight-page'))
  } else {
    nextTick(() => {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-syntax-highlight-page'))
      }, 100)
    })
  }
}

// ---- 侧边栏菜单 ----
const handleSidebarMenuCommand = async (command: string) => {
  // 处理分组展开事件（ConnectionSidebar 内部用）
  if (command.startsWith('__toggleGroup__')) {
    const type = command.replace('__toggleGroup__', '')
    connectionGroupExpanded.value[type] = !connectionGroupExpanded.value[type]
    return
  }

  switch (command) {
    case 'plugins':
      handlePlugins()
      break
    case 'checkUpdate':
      updateDialogRef.value?.open()
      break
    case 'shortcuts':
      openShortcutsTab()
      break
    case 'settings':
      openSettingsTab()
      break
    case 'about':
      isAboutDialogOpen.value = true
      break
  }
}

// ---- 命令/终端回调 ----
const handleTerminalClose = (connId: string | number) => {
  const tab = connectionTabs.value.find(
    (t) => String(t.id) === String(connId) || String(t.sessionId) === String(connId)
  )
  if (tab?.connectionType === 'com' && tab.comName) {
    delete connectedSerialPorts[tab.comName]
  }

  const tabId = tab?.id?.toString() || connId.toString()

  // 清理分屏面板中的该 tab
  onTabClosed(tabId)

  closeTab(connId.toString())
}

const isSerialPortConnected = (path: string) => !!connectedSerialPorts[path]

const disconnectSerialPort = async (path: string) => {
  const tab = connectionTabs.value.find((t) => t.comName === path && t.connectionType === 'com')
  if (tab) {
    comTerminalRefs[tab.id]?.preventAutoReconnect?.()
    comTerminalRefs[tab.id]?.disconnect?.()
  }
}

// ---- F12 DevTools ----
window.addEventListener(
  'keydown',
  (e: KeyboardEvent) => {
    if (e.key === 'F12' || e.keyCode === 123) {
      e.preventDefault()
      window.toolApi.openDevtools()
    }
    handleShortcutKeydown(e)
  },
  true
)

// ---- 设置更新事件 ----
const handleSettingsUpdated = (event: Event) => {
  const settings = (event as CustomEvent).detail
  if (settings && 'notificationDuration' in settings) {
    notificationDuration.value = settings.notificationDuration === 5000 ? 5000 : 0
  }
  if (settings && 'showPortType' in settings) {
    showPortType.value = settings.showPortType
  }
  if (settings && 'showSerialPortFriendlyName' in settings) {
    showSerialPortFriendlyName.value = settings.showSerialPortFriendlyName
  }
  if (settings && 'showSerialPortDetails' in settings) {
    showSerialPortDetails.value = settings.showSerialPortDetails
  }
}

const loadNotificationDuration = async () => {
  try {
    const settings = await window.storageApi.getSettings()
    notificationDuration.value = settings?.notificationDuration === 5000 ? 5000 : 0
  } catch (error) {
    console.error('Failed to load notification duration:', error)
  }
}

// ---- Lifecycle ----
onMounted(async () => {
  // 初始化主题
  const savedTheme = localStorage.getItem('app-theme') || 'dark'
  document.documentElement.setAttribute('data-theme', savedTheme)

  await loadNotificationDuration()

  loadSidebarState()
  loadConnections()
  loadSerialPorts()
  loadShortcutActions()
  loadShortcuts()
  loadTerminalDisplaySettings()
  loadTerminalDisplayText()
  initTerminalDisplayTextListener()

  // 会话恢复：重建上次退出时打开的选项卡，并恢复连接状态
  await sessionRestore.restore()
  await sessionRestore.applyToWorkspace()

  if (activeTabId.value) {
    updateCurrentFont(activeTabId.value)
  }

  window.connectApi.onConnectClose((sessionId: number | string) => {
    const tab = connectionTabs.value.find((t) => String(t.sessionId) === String(sessionId))
    if (tab && tab.connectionType === 'com') {
      delete connectedSerialPorts[tab.comName!]
    }
  })

  window.connectApi.onLogSplit(
    (data: { connId: string; oldFileName: string; newFileName: string }) => {
      handleLogSplit(data)
    }
  )

  // 串口热插拔：插入/拔出时自动刷新侧边栏串口列表
  window.connectApi.onSerialPortsChanged(handleSerialPortsChanged)

  window.addEventListener('terminal-text-cleared', handleTerminalTextCleared)
  window.addEventListener('auto-scroll-toast', handleAutoScrollToast)

  document.addEventListener('contextmenu', (e: MouseEvent) => {
    const tabEl = (e.target as HTMLElement).closest('.tab-item')
    if (tabEl) return
    if (showTabMenu.value) hideTabMenu()
  })

  document.addEventListener('click', (e: MouseEvent) => {
    const tabEl = (e.target as HTMLElement).closest('.tab-item')
    if (tabEl) return
    if (showTabMenu.value) hideTabMenu()
  })

  window.addEventListener('shortcuts-updated', handleShortcutsUpdated)
  window.addEventListener('settings-updated', handleSettingsUpdated)
})

onUnmounted(() => {
  stopConnectionStatePolling()
  stopResize()
  window.removeEventListener('shortcuts-updated', handleShortcutsUpdated)
  window.removeEventListener('settings-updated', handleSettingsUpdated)
  window.removeEventListener('terminal-text-cleared', handleTerminalTextCleared)
  window.removeEventListener('auto-scroll-toast', handleAutoScrollToast)
})
</script>

<style scoped>
.app-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.terminal-wrapper {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 终端组件池：隐藏容器，所有终端组件在此渲染并通过 Teleport 分发 */
.terminal-pool {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  visibility: hidden;
}

.resource-monitor {
  height: 100%;
  margin-left: 5px;
  background-color: transparent;
  color: var(--statusbar-text);
  font-size: 11px;
  padding: 0px 10px;
  display: flex;
  align-items: center;
  width: fit-content;
  user-select: none;
}

.command-status {
  color: var(--statusbar-command-text);
  font-size: 12px;
  margin-left: auto;
  margin-right: 20px;
  display: flex;
  align-items: center;
  width: fit-content;
  user-select: none;
}

/* 无选项卡时的空状态显示 */
.empty-tabs-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--empty-placeholder-bg);
}

.logo-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.logo-container .logo-img {
  width: 96px;
  height: 96px;
  object-fit: contain;
  filter: var(--logo-img-shadow);
}

.logo-container .logo-text {
  font-size: 24px;
  font-weight: 700;
  color: var(--empty-logo-text);
  letter-spacing: 2px;
  text-shadow: var(--logo-text-shadow);
}

.logo-container .copyright {
  font-size: 12px;
  color: var(--empty-copyright);
  margin-top: 8px;
}

/* Element Plus 弹窗样式覆盖 */
.el-dialog {
  background: var(--dialog-bg) !important;
  border-radius: 8px !important;
}

.el-dialog__title {
  color: var(--dialog-text) !important;
  font-size: 18px !important;
}

.el-form-item__label {
  color: var(--text-primary) !important;
}

.el-input,
.el-select {
  --el-input-bg-color: var(--dialog-input-bg-override) !important;
  --el-input-text-color: var(--dialog-input-text-override) !important;
  --el-input-placeholder-color: var(--dialog-input-placeholder-override) !important;
  --el-border-color: var(--dialog-input-border-override) !important;
}

.el-input:focus-within,
.el-select:focus-within {
  --el-border-color: var(--focus-border-color) !important;
}
</style>
