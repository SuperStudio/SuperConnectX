<template>
  <AppShell>
    <template #titlebar>
      <WindowTitleBar
        :is-maximized="isMaximized"
        @minimize="minimizeWindow"
        @toggle-maximize="toggleMaximizeWindow"
        @close="closeWindow"
      >
        <template #right>
          <!-- 侧边栏开关：基础层 LayoutToggle -->
          <LayoutToggle
            variant="sidebar"
            :visible="sidebarVisible"
            title="Toggle sidebar"
            @toggle="sidebarVisible = !sidebarVisible"
          />
          <!-- 换肤：基础层 ThemeSwitcher，注入宿主已有控制器 -->
          <ThemeSwitcher :controller="theme" />
        </template>
      </WindowTitleBar>
    </template>

    <SidebarLayout :visible="sidebarVisible" :width="sidebarWidth" :min-width="160" :max-width="360">
      <nav class="sidebar">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="sidebar-item"
          :class="{ active: activeView === item.id }"
          @click="activeView = item.id"
        >
          {{ item.label }}
        </button>
      </nav>
      <template #footer>
        <SidebarFooter
          brand="SuperStudio"
          menu-title="Settings"
          :items="sidebarMenuItems"
          @command="handleSidebarCommand"
        />
      </template>
    </SidebarLayout>

    <!-- 侧边栏分隔条：通栏全高，与 SuperConnectX 一致；折叠时隐藏 -->
    <SidebarResizeHandle
      v-if="sidebarVisible"
      :resizing="sidebar.isResizing.value"
      @resize-start="sidebar.startResize"
    />

    <main class="main-area">
      <WorkbenchTabBar
        :tabs="displayTabs"
        :active-tab-id="activeTabId"
        :panel-id="''"
        @select-tab="activate"
        @hide-tab-menu="hideTabMenu"
        @reorder-tabs="reorderTabs"
        @toggle-pin="onActionPinToggle"
        @tab-context-menu="onTabContextMenu"
      />

      <!-- 选项卡右键菜单：基础层 WorkbenchTabMenu（通用项，默认英文文案） -->
      <WorkbenchTabMenu
        :visible="showTabMenu"
        :position="tabMenuPosition"
        :pinned="rightClickedTab ? isPinned(rightClickedTab.id) : false"
        @close="onMenuClose"
        @close-other="onCloseOthers"
        @close-left="onCloseToLeft"
        @close-right="onCloseToRight"
        @close-all="onCloseAllTabs"
        @move-to-first="moveTabToFirst"
        @move-to-last="moveTabToLast"
        @toggle-pin="togglePinContext"
        @hide="hideTabMenu"
      />

      <div class="main-content">
        <CounterPanel v-if="activeTabId === 'counter'" />
        <SettingsTab v-else-if="activeTabId === 'settings'" />
        <AboutPanel v-else-if="activeTabId === 'about'" :app-name="appName" />
      </div>
    </main>

    <template #statusbar>
      <StatusBar>
        <template #left>
          <!-- 资源监视：基础层 ResourceMonitor，数据源经 fetcher 注入（此处为模拟数据） -->
          <div class="resource-monitor">
            <ResourceMonitor :fetcher="mockResourceFetcher" mem-label="内存" />
          </div>
        </template>
        <template #right></template>
      </StatusBar>
    </template>

    <NotificationCenter ref="notifierRef" />
  </AppShell>
</template>

<script setup lang="ts">
import { computed, markRaw, onMounted, ref } from 'vue'
// workspace 包消费：@superx/foundation / @superx/shared（无需复制源码，改包即全局生效）
import AppShell from '@superx/foundation/shell/AppShell.vue'
import WindowTitleBar from '@superx/foundation/shell/WindowTitleBar.vue'
import StatusBar from '@superx/foundation/shell/StatusBar.vue'
import ResourceMonitor from '@superx/foundation/shell/ResourceMonitor.vue'
import NotificationCenter from '@superx/foundation/shell/NotificationCenter.vue'
import SidebarLayout from '@superx/foundation/shell/SidebarLayout.vue'
import SidebarFooter from '@superx/foundation/shell/SidebarFooter.vue'
import SidebarResizeHandle from '@superx/foundation/shell/SidebarResizeHandle.vue'
import LayoutToggle from '@superx/foundation/shell/LayoutToggle.vue'
import { useSidebarResize } from '@superx/foundation/shell/useSidebarResize'
import { useWindowControls } from '@superx/foundation/shell/useWindowControls'
import WorkbenchTabBar from '@superx/foundation/workbench/WorkbenchTabBar.vue'
import WorkbenchTabMenu from '@superx/foundation/workbench/WorkbenchTabMenu.vue'
import { useTheme } from '@superx/foundation/theme/useTheme'
import ThemeSwitcher from '@superx/foundation/theme/ThemeSwitcher.vue'
import { useWorkbenchTabs } from '@superx/foundation/workbench/useWorkbenchTabs'
import type { WorkbenchTab } from '@superx/shared/workbench/types'
import CounterPanel from './features/counter/CounterPanel.vue'
import SettingsTab from './components/SettingsTab.vue'
import AboutPanel from './components/AboutPanel.vue'

const appName = 'Base Desktop App'
const theme = useTheme({ storageKey: 'app-theme', defaultTheme: 'dark' })

// ----- resource monitor (demo data source; host normally bridges to its own IPC) -----
const mockResourceFetcher = () => ({
  cpu: (10 + Math.random() * 30).toFixed(2),
  memRate: (30 + Math.random() * 40).toFixed(2)
})

// ----- sidebar (controlled: host owns width/visible, package owns gesture) -----
const sidebarWidth = ref(220)
const sidebarVisible = ref(true)
const sidebar = useSidebarResize({
  width: sidebarWidth,
  visible: sidebarVisible,
  minWidth: 160,
  maxWidth: 360
})

const navItems = [
  { id: 'counter', label: 'Counter' },
  { id: 'settings', label: 'Settings' },
  { id: 'about', label: 'About' }
] as const
type ViewId = typeof navItems[number]['id']
const activeView = ref<ViewId>('counter')

// ----- sidebar footer menu (foundation SidebarFooter) -----
const sidebarMenuItems = [
  { id: 'settings', label: 'Settings' },
  { id: 'about', label: 'About' }
]

const handleSidebarCommand = (command: string): void => {
  if (command === 'settings' || command === 'about') activeView.value = command
}

// ----- tab strip -----
const tabsController = useWorkbenchTabs<WorkbenchTab>()
const {
  tabs,
  activeTabId,
  activate,
  removeTab,
  reorderTabs,
  hideTabMenu,
  showTabMenu,
  tabMenuPosition,
  rightClickedTab,
  openTabContextMenu,
  moveTabToFirst,
  moveTabToLast,
  togglePinContext,
  isPinned
} = tabsController

// 控制器的固定状态存于 pinnedTabs Set；WorkbenchTabBar 读取 tab.pinned 属性，
// 此处做与 SuperConnectX 相同的映射（含引用副本，避免直接改动控制器数据）
const displayTabs = computed(() =>
  tabs.value.map((t) => ({ ...t, pinned: isPinned(t.id) }))
)

const seedTabs = (): void => {
  for (const item of navItems) {
    tabsController.addTab(markRaw<WorkbenchTab>({ id: item.id, title: item.label }))
  }
  tabsController.activate('counter')
}

const onCloseTab = (tabId: string): void => {
  if (tabs.value.length <= 1) return
  removeTab(tabId)
}

// 与 SuperConnectX 一致的单按钮语义：已固定 → 取消固定；未固定 → 关闭
const onActionPinToggle = (tabId: string): void => {
  if (isPinned(tabId)) {
    tabsController.togglePin(tabId)
  } else {
    onCloseTab(tabId)
  }
}

// WorkbenchTabBar 上抛的是 tabId，需自行解析为 tab 对象再交给控制器
const onTabContextMenu = (event: MouseEvent, tabId: string): void => {
  const tab = tabs.value.find((t) => t.id === tabId)
  if (tab) openTabContextMenu(event, tab)
}

// ----- tab context menu actions -----
const onMenuClose = (): void => {
  const id = rightClickedTab.value?.id
  if (id !== undefined) onCloseTab(String(id))
  hideTabMenu()
}

const closeMany = (ids: string[]): void => {
  for (const id of ids) removeTab(id)
}

const onCloseOthers = (): void => {
  const keep = rightClickedTab.value?.id
  if (keep === undefined) return
  closeMany(
    tabs.value
      .filter((t) => t.id !== keep && !t.pinned)
      .map((t) => String(t.id))
  )
  hideTabMenu()
}

const onCloseToLeft = (): void => {
  const idx = tabs.value.findIndex((t) => t.id === rightClickedTab.value?.id)
  if (idx <= 0) return
  closeMany(
    tabs.value
      .slice(0, idx)
      .filter((t) => !t.pinned)
      .map((t) => String(t.id))
  )
  hideTabMenu()
}

const onCloseToRight = (): void => {
  const idx = tabs.value.findIndex((t) => t.id === rightClickedTab.value?.id)
  if (idx < 0) return
  closeMany(
    tabs.value
      .slice(idx + 1)
      .filter((t) => !t.pinned)
      .map((t) => String(t.id))
  )
  hideTabMenu()
}

const onCloseAllTabs = (): void => {
  closeMany(
    tabs.value
      .filter((t) => !t.pinned)
      .map((t) => String(t.id))
  )
  hideTabMenu()
}

// ----- window controls (custom titlebar buttons → IPC → main) -----
// 逻辑在 @superx/foundation 的 useWindowControls，这里只注入 preload 桥接
const { isMaximized, minimize: minimizeWindow, toggleMaximize: toggleMaximizeWindow, close: closeWindow } =
  useWindowControls(window.api.window)

onMounted(() => {
  seedTabs()
})

// ----- notifier (forwarded through ref) -----
const notifierRef = ref<InstanceType<typeof NotificationCenter> | null>(null)
defineExpose({ notify: (title: string, message: string) => notifierRef.value?.add(title, message) })
</script>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  flex: 1;
  overflow-y: auto;
}

.sidebar-item {
  padding: 10px 16px;
  border: 0;
  background: transparent;
  color: var(--sidebar-item-color);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.sidebar-item:hover { background: var(--sidebar-item-hover); }
.sidebar-item.active {
  background: var(--sidebar-item-active);
  color: var(--sidebar-item-active-color);
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--bg-primary);
  overflow: hidden;
}

.main-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.statusbar-section {
  padding: 0 12px;
  font-size: 12px;
  color: var(--statusbar-text);
}

/* 资源监视条包裹：与 SuperConnectX 状态栏保持一致 */
.resource-monitor {
  height: 100%;
  background-color: transparent;
  color: var(--statusbar-text);
  font-size: 11px;
  padding: 0px 10px 0px 5px;
  display: flex;
  align-items: center;
}

.statusbar-action {
  background: transparent;
  border: 0;
  color: var(--statusbar-text);
  font-size: 12px;
  padding: 0 12px;
  cursor: pointer;
}
.statusbar-action:hover { background: var(--btn-primary-hover); }
</style>
