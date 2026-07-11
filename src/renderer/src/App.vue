<template>
  <div class="app-container">
    <CustomTitleBar
      @toggle-connection-list="toggleConnectionList"
      @refreshCommands="refreshHandler"
      @refreshConnections="loadConnections"
      @notifyImport="handleImportNotify"
      @change-font="handleFontChange"
      @change-font-size="handleFontSizeChange"
      @open-about="isAboutDialogOpen = true"
      @open-settings="openSettingsTab"
      @open-shortcuts="openShortcutsTab"
      @check-update="updateDialogRef?.open()"
      @open-plugins="handlePlugins"
      @toggle-word-wrap="handleToggleWordWrap"
      @toggle-line-numbers="handleToggleLineNumbers"
      @toggle-log-editable="handleToggleLogEditable"
      :show-connection-list="showConnectionList"
      :current-font="currentFont"
      :word-wrap="terminalWordWrap"
      :line-numbers="terminalLineNumbers"
      :log-editable="terminalLogEditable"
    />
    <NotifyContainer ref="notifyContainerRef" />

    <main class="app-main">
      <!-- 侧边栏 -->
      <ConnectionSidebar
        :show-connection-list="showConnectionList"
        :sidebar-width="sidebarWidth"
        :serial-ports="serialPorts"
        :filtered-serial-ports="filteredSerialPorts"
        :serial-port-expanded="serialPortExpanded"
        :show-port-type="showPortType"
        :connection-groups="connectionGroups"
        :connection-group-expanded="connectionGroupExpanded"
        :serial-remarks="serialRemarks"
        :connections="connections"
        :is-serial-port-connected="isSerialPortConnected"
        @openCreateDialog="openCreateDialog"
        @search="handleSearch"
        @loadSerialPorts="loadSerialPorts"
        @connectToSerialPort="connectToSerialPort"
        @disconnectSerialPort="disconnectSerialPort"
        @connectToServer="connectToServer"
        @editCreateDialog="editCreateDialog"
        @deleteConnection="deleteConnection"
        @sidebarMenuCommand="handleSidebarMenuCommand"
        @update:serialPortExpanded="(v) => serialPortExpanded = v"
      />

      <!-- 侧边栏分隔条 -->
      <div v-if="showConnectionList" class="sidebar-resizer" @mousedown="startResize" :class="{ resizing: isResizing }"></div>

      <!-- 终端区域 -->
      <div class="terminal-wrapper" :class="{ expanded: !showConnectionList }">
        <!-- 选项卡栏 -->
        <TabBar
          :connection-tabs="connectionTabs"
          :active-tab-id="activeTabId"
          :pinned-tabs="pinnedTabs"
          :show-tab-menu="showTabMenu"
          :tab-menu-position="tabMenuPosition"
          :right-clicked-tab="rightClickedTab"
          :has-any-connected="hasAnyConnected"
          :serial-remarks="serialRemarks"
          :get-connection-status="getConnectionStatus"
          @switchTab="switchTabById"
          @hideTabMenu="hideTabMenu"
          @tabsNavContextMenu="handleTabsNavContextMenu"
          @tabContextMenu="handleTabContextMenu"
          @togglePinByButton="togglePinTabByButton"
          @disconnectAll="disconnectAllTabs"
          @connectAll="connectAllTabs"
          @closeSingle="closeSingleTab"
          @closeOther="closeOtherTabs"
          @closeLeft="closeLeftTabs"
          @closeRight="closeRightTabs"
          @closeAll="closeAllTabs"
          @moveToFirst="moveTabToFirst"
          @moveToLast="moveTabToLast"
          @reorderTabs="reorderTabs"
          @togglePin="togglePinTab"
          @openRemarkDialog="openRemarkDialogHandler"
        />

        <!-- 终端内容 -->
        <TerminalContainer
          :connection-tabs="connectionTabs"
          :active-tab-id="activeTabId"
          :onComTerminalRef="(id, el) => { comTerminalRefs[id] = el }"
          :onTelnetTerminalRef="(id, el) => { telnetTerminalRefs[id] = el }"
          @terminalClose="handleTerminalClose"
          @commandSent="handleCommandSent"
          @comConnected="(comName) => { connectedSerialPorts[comName] = true }"
          @comDisconnected="(comName) => { delete connectedSerialPorts[comName] }"
          @openCommandEditor="openCommandEditorTab"
          @openSyntaxHighlight="openSettingsAndSwitchToSyntax"
          @remarkUpdated="(data: any) => { if (data.comName) serialRemarks[data.comName] = data.remark }"
          @fontLoaded="(font: string) => { currentFont = font }"
        />

        <!-- 无选项卡时的空状态 -->
        <div v-if="connectionTabs.length === 0" class="empty-tabs-placeholder">
          <div class="logo-container">
            <img :src="logoImage" alt="SuperStudio" class="logo-img" />
            <div class="logo-text">SuperStudio</div>
            <div class="copyright">&copy; 2025 SuperStudio</div>
          </div>
        </div>
      </div>
    </main>

    <!-- 状态栏 -->
    <div class="status-bar">
      <div class="resource-monitor"><ResourceMonitor /></div>
      <div class="command-status" v-if="lastSentCommand">{{ t('notification.commandSent', { command: lastSentCommand }) }}</div>
    </div>

    <!-- 弹窗 -->
    <ConnectionDialog ref="connectionDialogRef" @submit="handleConnectionSubmit" />
    <AboutDialog v-model:modelValue="isAboutDialogOpen" />
    <UpdateDialog ref="updateDialogRef" v-model:modelValue="isUpdateDialogOpen" />

    <!-- 串口备注弹窗 -->
    <SerialRemarkDialog
      v-model:visible="showRemarkDialog"
      :com-name="editingRemarkComName"
      v-model:remark="editingRemark"
      @opened="onRemarkDialogOpened"
      @save="saveSerialRemarkHandler"
    />
  </div>
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
import ConnectionDialog from './components/ConnectionDialog.vue'
import ConnectionSidebar from './components/app/ConnectionSidebar.vue'
import TabBar from './components/app/TabBar.vue'
import TerminalContainer from './components/app/TerminalContainer.vue'
import SerialRemarkDialog from './components/app/SerialRemarkDialog.vue'
import logoImage from './assets/icon.png'

// Composables
import { useConnectionSidebar } from './composables/app/useConnectionSidebar'
import { useTabManager } from './composables/app/useTabManager'
import { useSerialRemarks } from './composables/app/useSerialRemarks'
import { useShortcuts } from './composables/app/useShortcuts'
import { useTerminalDisplay } from './composables/app/useTerminalDisplay'
import { useFontManager } from './composables/app/useFontManager'
import { useConnectionDialog } from './composables/app/useConnectionDialog'

const { t } = useI18n()

// ---- Refs ----
const notifyContainerRef = ref<InstanceType<typeof NotifyContainer> | null>(null)
const isAboutDialogOpen = ref(false)
const isUpdateDialogOpen = ref(false)
const updateDialogRef = ref<InstanceType<typeof UpdateDialog> | null>(null)
const lastSentCommand = ref('')

const connectedSerialPorts = reactive<Record<string, boolean>>({})
const comTerminalRefs = reactive<Record<string, any>>({})
const telnetTerminalRefs = reactive<Record<string, any>>({})

// ---- Sidebar ----
const {
  connections, serialPorts,
  showConnectionList, sidebarWidth, serialPortExpanded, showPortType,
  connectionGroupExpanded, filteredSerialPorts, connectionGroups,
  handleSearch, loadConnections, loadSerialPorts, loadSidebarState,
  toggleConnectionList
} = useConnectionSidebar()

// ---- Tab Manager ----
const {
  connectionTabs, activeTabId, pinnedTabs,
  showTabMenu, tabMenuPosition, rightClickedTab,
  switchTabById, handleTabContextMenu, handleTabsNavContextMenu, hideTabMenu,
  getConnectionStatus, hasAnyConnected,
  connectAllTabs, disconnectAllTabs,
  closeTab, closeSingleTab,
  closeOtherTabs, closeLeftTabs, closeRightTabs, closeAllTabs,
  reorderTabs, moveTabToFirst, moveTabToLast,
  togglePinTabByButton, togglePinTab,
  connectToServer, connectToSerialPort,
  openCommandEditorTab, openShortcutsTab, openSettingsTab
} = useTabManager(comTerminalRefs, telnetTerminalRefs)

// ---- Serial Remarks ----
const {
  showRemarkDialog, editingRemark, editingRemarkComName,
  serialRemarks,
  loadAllSerialRemarks, openRemarkDialog, onRemarkDialogOpened, saveSerialRemark
} = useSerialRemarks(comTerminalRefs)

const openRemarkDialogHandler = async () => {
  if (!rightClickedTab.value?.comName) return
  await openRemarkDialog(rightClickedTab.value)
  hideTabMenu()
}

const saveSerialRemarkHandler = () => {
  saveSerialRemark(rightClickedTab.value)
}

// ---- Connection Dialog ----
const connectionDialogRef = ref<InstanceType<typeof ConnectionDialog> | null>(null)
const {
  openCreateDialog, editCreateDialog,
  handleConnectionSubmit, deleteConnection
} = useConnectionDialog(loadConnections, connectionDialogRef)

// ---- Shortcuts ----
const {
  handleShortcutKeydown, loadShortcutActions, loadShortcuts,
  handleShortcutsUpdated
} = useShortcuts(
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
  connectionTabs, activeTabId, hasAnyConnected,
  comTerminalRefs, telnetTerminalRefs, rightClickedTab,
  disconnectAllTabs, connectAllTabs, switchTabById,
  togglePinTab, moveTabToFirst, moveTabToLast
)

// ---- Terminal Display ----
const {
  terminalWordWrap, terminalLineNumbers, terminalLogEditable,
  loadTerminalDisplaySettings, saveTerminalDisplaySettings,
  applyToAllTerminals, applyTerminalDisplaySettingsToTab
} = useTerminalDisplay()

// ---- Font Manager ----
const {
  currentFont, updateCurrentFont, handleFontChange, handleFontSizeChange
} = useFontManager(activeTabId, comTerminalRefs, telnetTerminalRefs)

// ---- Sidebar Resize ----
const isResizing = ref(false)
const resizeStartX = ref(0)
const resizeStartWidth = ref(0)
const MIN_SIDEBAR_WIDTH = 200

const startResize = (e: MouseEvent) => {
  isResizing.value = true
  resizeStartX.value = e.clientX
  resizeStartWidth.value = sidebarWidth.value
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
}

const onResize = (e: MouseEvent) => {
  if (!isResizing.value) return
  const delta = e.clientX - resizeStartX.value
  const newWidth = resizeStartWidth.value + delta
  if (newWidth <= 500) {
    const hideThreshold = MIN_SIDEBAR_WIDTH * 2 / 3
    if (newWidth < hideThreshold) {
      showConnectionList.value = false
      sidebarWidth.value = MIN_SIDEBAR_WIDTH
    } else {
      sidebarWidth.value = newWidth
    }
  }
}

const stopResize = () => {
  if (isResizing.value) {
    isResizing.value = false
    document.removeEventListener('mousemove', onResize)
    document.removeEventListener('mouseup', stopResize)
  }
}

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
watch(serialPorts, async (newPorts) => {
  for (const port of newPorts) {
    if (!serialRemarks[port.path]) {
      await loadAllSerialRemarks(newPorts)
      break
    }
  }
}, { immediate: true })

// ---- 工具栏回调 ----
const handleImportNotify = (payload: { success: boolean; title: string; message: string }) => {
  notifyContainerRef.value?.add(payload.title, payload.message)
}

const handleLogSplit = (data: { connId: string; oldFileName: string; newFileName: string }) => {
  const tab = connectionTabs.value.find((t) => String(t.sessionId) === String(data.connId))
  const tabName = tab?.name || tab?.comName || data.connId
  const message = t('notification.logSplitMessage', { name: tabName, file: data.newFileName })
  notifyContainerRef.value?.add(t('notification.logSplit'), message)
  if (tab) {
    const tabId = tab.id
    if (tab.connectionType === 'com') {
      comTerminalRefs[tabId]?.clearTerminal?.()
    } else if (tab.connectionType === 'telnet') {
      telnetTerminalRefs[tabId]?.clearTerminal?.()
    }
  }
}

const handleTerminalTextCleared = (e: Event) => {
  const detail = (e as CustomEvent).detail
  const name = detail?.connectionName || ''
  notifyContainerRef.value?.add(t('notification.textCleared'), t('notification.textClearedMessage', { name }))
}

const handleAutoScrollToast = (e: Event) => {
  const detail = (e as CustomEvent).detail
  const name = detail?.connectionName || ''
  notifyContainerRef.value?.add(t('notification.autoScrollStopped'), t('notification.autoScrollStoppedMessage', { name }))
}

// ---- 工具栏/设置回调 ----
const refreshHandler = () => {
  if (activeTabId.value) {
    const tabId = activeTabId.value
    if (comTerminalRefs[tabId]) {
      comTerminalRefs[tabId]?.refreshGroupsCmds?.()
    } else {
      telnetTerminalRefs[tabId]?.refreshGroupsCmds?.()
    }
  }
}

async function handleToggleWordWrap() {
  terminalWordWrap.value = !terminalWordWrap.value
  applyToAllTerminals(connectionTabs.value, comTerminalRefs, telnetTerminalRefs, 'setWordWrap', terminalWordWrap.value)
  await saveTerminalDisplaySettings()
}

const handleToggleLineNumbers = async () => {
  terminalLineNumbers.value = !terminalLineNumbers.value
  applyToAllTerminals(connectionTabs.value, comTerminalRefs, telnetTerminalRefs, 'setLineNumbers', terminalLineNumbers.value)
  await saveTerminalDisplaySettings()
}

const handleToggleLogEditable = async () => {
  terminalLogEditable.value = !terminalLogEditable.value
  applyToAllTerminals(connectionTabs.value, comTerminalRefs, telnetTerminalRefs, 'setLogEditable', terminalLogEditable.value)
  await saveTerminalDisplaySettings()
}

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
    case 'plugins': handlePlugins(); break
    case 'checkUpdate': updateDialogRef.value?.open(); break
    case 'shortcuts': openShortcutsTab(); break
    case 'settings': openSettingsTab(); break
    case 'about': isAboutDialogOpen.value = true; break
  }
}

// ---- 命令/终端回调 ----
const handleCommandSent = (command: string) => {
  lastSentCommand.value = command
}

const handleTerminalClose = (connId: string | number) => {
  const tab = connectionTabs.value.find((t) => String(t.id) === String(connId) || String(t.sessionId) === String(connId))
  if (tab?.connectionType === 'com' && tab.comName) {
    delete connectedSerialPorts[tab.comName]
  }
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
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'F12' || e.keyCode === 123) {
    e.preventDefault()
    window.toolApi.openDevtools()
  }
  handleShortcutKeydown(e)
}, true)

// ---- 设置更新事件 ----
const handleSettingsUpdated = (event: Event) => {
  const settings = (event as CustomEvent).detail
  if (settings && 'showPortType' in settings) {
    showPortType.value = settings.showPortType
  }
}

// ---- Lifecycle ----
onMounted(() => {
  loadSidebarState()
  loadConnections()
  loadSerialPorts()
  loadShortcutActions()
  loadShortcuts()
  loadTerminalDisplaySettings()

  if (activeTabId.value) {
    updateCurrentFont(activeTabId.value)
  }

  window.connectApi.onConnectClose((sessionId: number | string) => {
    const tab = connectionTabs.value.find((t) => String(t.sessionId) === String(sessionId))
    if (tab && tab.connectionType === 'com') {
      delete connectedSerialPorts[tab.comName!]
    }
  })

  window.connectApi.onLogSplit((data: { connId: string; oldFileName: string; newFileName: string }) => {
    handleLogSplit(data)
  })

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
  window.removeEventListener('shortcuts-updated', handleShortcutsUpdated)
  window.removeEventListener('settings-updated', handleSettingsUpdated)
  window.removeEventListener('terminal-text-cleared', handleTerminalTextCleared)
  window.removeEventListener('auto-scroll-toast', handleAutoScrollToast)
})
</script>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #fff;
  overflow: hidden;
}

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
}

/* 侧边栏分隔条 */
.sidebar-resizer {
  width: 4px;
  height: 100%;
  background: transparent;
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  transition: background-color 0.2s;
}

.sidebar-resizer:hover,
.sidebar-resizer.resizing {
  background-color: #409eff;
}

.status-bar {
  height: 25px;
  background-color: #007acc;
  display: flex;
}

.resource-monitor {
  height: 100%;
  margin-left: 5px;
  background-color: transparent;
  color: white;
  font-size: 11px;
  padding: 0px 10px;
  display: flex;
  align-items: center;
  width: fit-content;
  user-select: none;
}

.command-status {
  color: #e0e0e0;
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
  background-color: #1e1e1e;
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
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));
}

.logo-container .logo-text {
  font-size: 24px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 2px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.logo-container .copyright {
  font-size: 12px;
  color: #888;
  margin-top: 8px;
}

/* Element Plus 弹窗样式覆盖 */
.el-dialog {
  background: #252526 !important;
  border-radius: 8px !important;
}

.el-dialog__title {
  color: #f0f0f0 !important;
  font-size: 18px !important;
}

.el-form-item__label {
  color: #e8e8e8 !important;
}

.el-input,
.el-select {
  --el-input-bg-color: #cccccc !important;
  --el-input-text-color: #000 !important;
  --el-input-placeholder-color: #888 !important;
  --el-border-color: #444 !important;
}

.el-input:focus-within,
.el-select:focus-within {
  --el-border-color: var(--focus-border-color) !important;
}
</style>
