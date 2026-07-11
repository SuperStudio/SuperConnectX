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
          @updateSplitRatio="updateSplitRatio"
        >
          <!-- 左面板：panel-0 -->
          <template #left>
            <TerminalPanel
              :ref="(el: any) => { if (el) panelRefs['panel-0'] = el }"
              panel-id="panel-0"
              :panel-tabs="getPanel0Tabs()"
              :active-tab-id="splitState.panels[0].activeTabId || activeTabId"
              :pinned-tabs="pinnedTabs"
              :show-tab-menu="showTabMenu"
              :tab-menu-position="tabMenuPosition"
              :right-clicked-tab="rightClickedTab"
              :has-any-connected="hasAnyConnected"
              :serial-remarks="serialRemarks"
              :get-connection-status="getConnectionStatus"
              @switchTab="(id: any) => { switchPanelTab('panel-0', id.toString()); originalSwitchTabById(id) }"
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
              @reorderTabsWithPin="(fromId: any, targetId: any, pos: any, toPin: any) => reorderTabs(fromId, targetId, pos, toPin)"
              @splitToNewPanel="handleSplitToNewPanel"
              @togglePin="togglePinTab"
              @openRemarkDialog="openRemarkDialogHandler"
            >
              <!-- 终端组件通过 Teleport 从终端池传入，slot 为空 -->
            </TerminalPanel>
          </template>

          <!-- 右面板：分屏时渲染 -->
          <template v-if="splitState.panels.length > 1" #right>
            <TerminalPanel
              v-for="panel in splitState.panels.slice(1)"
              :key="panel.id"
              :ref="(el: any) => { if (el) panelRefs[panel.id] = el }"
              :panel-id="panel.id"
              :panel-tabs="getPanelTabs(panel)"
              :active-tab-id="panel.activeTabId"
              :pinned-tabs="pinnedTabs"
              :show-tab-menu="showTabMenu"
              :tab-menu-position="tabMenuPosition"
              :right-clicked-tab="rightClickedTab"
              :has-any-connected="hasAnyConnected"
              :serial-remarks="serialRemarks"
              :get-connection-status="getConnectionStatus"
              @switchTab="(id: any) => { switchPanelTab(panel.id, id.toString()); originalSwitchTabById(id) }"
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
              @reorderTabsWithPin="(fromId: any, targetId: any, pos: any, toPin: any) => reorderTabs(fromId, targetId, pos, toPin)"
              @splitToNewPanel="handleSplitToNewPanel"
              @togglePin="togglePinTab"
              @openRemarkDialog="openRemarkDialogHandler"
            >
            </TerminalPanel>
          </template>
        </SuperSplit>

        <!-- 终端组件池：所有终端组件在此渲染，通过 Teleport 分发到各面板 -->
        <div class="terminal-pool">
          <template v-for="tab in connectionTabs" :key="tab.id">
            <Teleport
              :to="`#terminal-area-${getTabPanelId(tab.id.toString())}`"
              :disabled="false"
            >
              <ComTerminal
                v-if="tab.connectionType === 'com'"
                v-show="isTabActiveInItsPanel(tab.id.toString())"
                :connection="tab"
                :ref="(el: any) => { if (el) comTerminalRefs[tab.id] = el }"
                :auto-connect="true"
                @onClose="handleTerminalClose(tab.id)"
                @commandSent="handleCommandSent"
                @onConnect="() => { connectedSerialPorts[tab.comName] = true }"
                @onDisconnect="() => { delete connectedSerialPorts[tab.comName] }"
                @openCommandEditor="openCommandEditorTab"
                @openSyntaxHighlight="openSettingsAndSwitchToSyntax"
                @remarkUpdated="(data: any) => { if (data.comName) serialRemarks[data.comName] = data.remark }"
                @fontLoaded="(font: string) => { currentFont = font }"
                class="terminal-component"
              />
              <TelnetTerminal
                v-if="tab.connectionType === 'telnet' || tab.connectionType === 'ftp'"
                v-show="isTabActiveInItsPanel(tab.id.toString())"
                :connection="tab"
                :ref="(el: any) => { if (el) telnetTerminalRefs[tab.id] = el }"
                @onClose="handleTerminalClose(tab.id)"
                @commandSent="handleCommandSent"
                @openCommandEditor="openCommandEditorTab"
                @openSyntaxHighlight="openSettingsAndSwitchToSyntax"
                @fontLoaded="(font: string) => { currentFont = font }"
                class="terminal-component"
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
            </Teleport>
          </template>
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
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import CustomTitleBar from './components/CustomTitleBar.vue'
import NotifyContainer from './components/NotifyContainer.vue'
import ResourceMonitor from './components/ResourceMonitor.vue'
import AboutDialog from './components/AboutDialog.vue'
import UpdateDialog from './components/UpdateDialog.vue'
import ConnectionDialog from './components/ConnectionDialog.vue'
import ConnectionSidebar from './components/app/ConnectionSidebar.vue'
import TerminalPanel from './components/app/TerminalPanel.vue'
import SuperSplit from './components/app/SuperSplit.vue'
import SerialRemarkDialog from './components/app/SerialRemarkDialog.vue'
import ComTerminal from './components/ComTerminal.vue'
import TelnetTerminal from './components/TelnetTerminal.vue'
import CommandEditor from './components/CommandEditor.vue'
import ShortcutsPage from './components/ShortcutsPage.vue'
import SettingsPage from './components/SettingsPage.vue'
import logoImage from './assets/icon.png'

// Composables
import { useConnectionSidebar } from './composables/app/useConnectionSidebar'
import { useTabManager } from './composables/app/useTabManager'
import { useSplitPanel } from './composables/app/useSplitPanel'
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

// SuperSplit & 面板 refs
const superSplitRef = ref<InstanceType<typeof SuperSplit> | null>(null)
const panelRefs = reactive<Record<string, InstanceType<typeof TerminalPanel> | null>>({})

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

// ---- Split Panel ----
const {
  splitState,
  panelCount,
  splitPanel,
  removePanel,
  switchPanelTab,
  updateSplitRatio,
  onTabClosed
} = useSplitPanel(activeTabId.value)

// 当 connectionTabs 变化时，同步 tabIds 到面板
watch(connectionTabs, (tabs) => {
  const allIds = tabs.map(t => t.id.toString())

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

  // 移除所有空面板（但至少保留 panel-0）
  for (let i = splitState.panels.length - 1; i >= 1; i--) {
    if (splitState.panels[i].tabIds.length === 0) {
      splitState.panels.splice(i, 1)
    }
  }

  // 如果只剩一个面板，取消分屏
  if (splitState.panels.length === 1) {
    splitState.splitRatio = 1
  }
}, { immediate: true, deep: true })

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

// ---- 分屏操作 ----

// 当前是否处于分屏状态
const isSplit = computed(() => splitState.panels.length > 1)

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
  const panel = splitState.panels.find(p => p.id === panelId)
  if (!panel) return false
  return panel.activeTabId === tabId
}

const handleSplitToNewPanel = () => {
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
    const otherTab = srcPanel.tabIds.find(id => id !== tabId)
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
 * 合并面板：把所有 tab 移回 panel-0
 */
const handleMergePanel = () => {
  if (splitState.panels.length <= 1) return

  // removePanel 内部会把 tabIds 合并到 panel-0，逐个移除即可
  while (splitState.panels.length > 1) {
    const lastPanel = splitState.panels[splitState.panels.length - 1]
    removePanel(lastPanel.id)
  }

  // 确保第一个面板显示一个有效的 tab
  if (splitState.panels[0].tabIds.length > 0 && !splitState.panels[0].activeTabId) {
    splitState.panels[0].activeTabId = splitState.panels[0].tabIds[0]
  }
  if (splitState.panels[0].activeTabId) {
    activeTabId.value = splitState.panels[0].activeTabId
  }
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

// ---- 重写 switchTabById，同步到分屏面板 ----
const originalSwitchTabById = switchTabById

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

// 获取某个面板拥有的 tabs（过滤 connectionTabs）
const getPanelTabs = (panel: { id: string; tabIds: string[] }) => {
  const tabIdSet = new Set(panel.tabIds)
  return connectionTabs.value.filter(t => tabIdSet.has(t.id.toString()))
}

// 获取 panel-0 的 tabs（排除已分屏到其他面板的 tab）
const getPanel0Tabs = () => {
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
  return connectionTabs.value.filter(t => !otherTabIds.has(t.id.toString()))
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
