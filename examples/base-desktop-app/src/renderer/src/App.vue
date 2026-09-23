<template>
  <AppShell>
    <template #titlebar>
      <WindowTitleBar :is-maximized="false" />
    </template>

    <SidebarLayout>
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
    </SidebarLayout>

    <main class="main-area">
      <WorkbenchTabBar
        :tabs="tabs"
        :active-tab-id="activeTabId"
        :panel-id="''"
        @select-tab="activate"
        @close-tab="onCloseTab"
        @hide-tab-menu="hideTabMenu"
        @reorder-tabs="(from, to, pos) => reorderTabs(from, to, pos, false)"
      >
        <template #title="{ tab }">{{ tab.title }}</template>
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
import AppShell from './foundation/shell/AppShell.vue'
import WindowTitleBar from './foundation/shell/WindowTitleBar.vue'
import StatusBar from './foundation/shell/StatusBar.vue'
import NotificationCenter from './foundation/shell/NotificationCenter.vue'
import SidebarLayout from './foundation/shell/SidebarLayout.vue'
import WorkbenchTabBar from './foundation/workbench/WorkbenchTabBar.vue'
import { useTheme } from './foundation/theme/useTheme'
import { useWorkbenchTabs } from './foundation/workbench/useWorkbenchTabs'
import type { WorkbenchTab } from '../../shared/workbench/types'
import CounterPanel from './features/counter/CounterPanel.vue'
import SettingsTab from './components/SettingsTab.vue'
import AboutPanel from './components/AboutPanel.vue'

const appName = 'Base Desktop App'
const theme = useTheme({ storageKey: 'app-theme', defaultTheme: 'dark' })

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
