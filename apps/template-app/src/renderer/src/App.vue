<template>
  <AppShell>
    <template #titlebar>
      <WindowTitleBar
        :is-maximized="isMaximized"
        @minimize="minimizeWindow"
        @toggle-maximize="toggleMaximizeWindow"
        @close="closeWindow"
      />
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
        <SidebarResizeHandle :resizing="sidebar.isResizing.value" @resize-start="sidebar.startResize" />
      </template>
    </SidebarLayout>

    <main class="main-area">
      <WorkbenchTabBar
        :tabs="tabs"
        :active-tab-id="activeTabId"
        :panel-id="''"
        @select-tab="activate"
        @close-tab="onCloseTab"
        @hide-tab-menu="hideTabMenu"
        @reorder-tabs="reorderTabs"
      >
        <template #title="{ tab }">{{ tab.title }}</template>
        <template #action="{ tab }">
          <button
            class="tab-action-btn"
            :class="{ pinned: tab.pinned }"
            type="button"
            :aria-label="tab.pinned ? 'Unpin tab' : 'Pin tab'"
            @click.stop="onTogglePin(tab.id)"
          />
          <button
            class="tab-action-btn tab-action-close"
            type="button"
            aria-label="Close tab"
            @click.stop="onCloseTab(tab.id)"
          >
            ×
          </button>
        </template>
      </WorkbenchTabBar>

      <div class="main-content">
        <CounterPanel v-if="activeTabId === 'counter'" />
        <SettingsTab v-else-if="activeTabId === 'settings'" />
        <AboutPanel v-else-if="activeTabId === 'about'" :app-name="appName" />
      </div>
    </main>

    <template #statusbar>
      <StatusBar>
        <template #left>
          <span class="statusbar-section">theme: {{ theme.theme.value }}</span>
        </template>
        <template #right>
          <button class="statusbar-action" type="button" @click="theme.toggleTheme">Toggle theme</button>
        </template>
      </StatusBar>
    </template>

    <NotificationCenter ref="notifierRef" />
  </AppShell>
</template>

<script setup lang="ts">
import { markRaw, onMounted, ref } from 'vue'
// workspace 包消费：@superx/foundation / @superx/shared（无需复制源码，改包即全局生效）
import AppShell from '@superx/foundation/shell/AppShell.vue'
import WindowTitleBar from '@superx/foundation/shell/WindowTitleBar.vue'
import StatusBar from '@superx/foundation/shell/StatusBar.vue'
import NotificationCenter from '@superx/foundation/shell/NotificationCenter.vue'
import SidebarLayout from '@superx/foundation/shell/SidebarLayout.vue'
import SidebarResizeHandle from '@superx/foundation/shell/SidebarResizeHandle.vue'
import { useSidebarResize } from '@superx/foundation/shell/useSidebarResize'
import { useWindowControls } from '@superx/foundation/shell/useWindowControls'
import WorkbenchTabBar from '@superx/foundation/workbench/WorkbenchTabBar.vue'
import { useTheme } from '@superx/foundation/theme/useTheme'
import { useWorkbenchTabs } from '@superx/foundation/workbench/useWorkbenchTabs'
import type { WorkbenchTab } from '@superx/shared/workbench/types'
import CounterPanel from './features/counter/CounterPanel.vue'
import SettingsTab from './components/SettingsTab.vue'
import AboutPanel from './components/AboutPanel.vue'

const appName = 'Base Desktop App'
const theme = useTheme({ storageKey: 'app-theme', defaultTheme: 'dark' })

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

// ----- tab strip -----
const tabsController = useWorkbenchTabs<WorkbenchTab>()
const { tabs, activeTabId, activate, removeTab, reorderTabs, hideTabMenu } = tabsController

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

const onTogglePin = (tabId: string): void => {
  const tab = tabs.value.find((t) => t.id === tabId)
  if (tab) tab.pinned = !tab.pinned
  tabsController.togglePin(tabId)
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
