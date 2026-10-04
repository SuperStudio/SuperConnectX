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
          :class="{ active: activeTabId === item.id }"
          @click="openView(item.id)"
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
      <!-- 分屏工作区：基础层 SplitWorkspace（左右面板 + 拖拽分屏 + 分隔条拖拽） -->
      <SplitWorkspace
        :is-split="isSplit"
        :split-ratio="splitRatio"
        drop-hint="Drop tab to split"
        @update-split-ratio="updateSplitRatio"
        @tab-drop-to-pane="handleTabDropToPane"
      >
        <!-- 左面板：panel-0 -->
        <template #left>
          <div class="panel">
            <WorkbenchTabBar
              :tabs="panel0DisplayTabs"
              :active-tab-id="splitState.panels[0]?.activeTabId || activeTabId"
              :panel-id="'panel-0'"
              @select-tab="(id: string) => selectInPanel('panel-0', id)"
              @hide-tab-menu="hideTabMenu"
              @reorder-tabs="reorderTabs"
              @toggle-pin="onActionPinToggle"
              @tab-context-menu="(e: MouseEvent, id: string) => onTabContextMenuInPanel('panel-0', e, id)"
            />
            <div :id="contentDomId('panel-0')" class="panel-content">
              <div v-if="tabs.length === 0" class="empty-state">
                Select a view from the sidebar to open a tab
              </div>
            </div>
          </div>
        </template>

        <!-- 右面板：分屏时渲染 -->
        <template #right>
          <div v-for="panel in splitState.panels.slice(1)" :key="panel.id" class="panel">
            <WorkbenchTabBar
              :tabs="panelDisplayTabs(panel)"
              :active-tab-id="panel.activeTabId"
              :panel-id="panel.id"
              @select-tab="(id: string) => selectInPanel(panel.id, id)"
              @hide-tab-menu="hideTabMenu"
              @reorder-tabs="reorderTabs"
              @toggle-pin="onActionPinToggle"
              @tab-context-menu="(e: MouseEvent, id: string) => onTabContextMenuInPanel(panel.id, e, id)"
            />
            <div :id="contentDomId(panel.id)" class="panel-content" />
          </div>
        </template>
      </SplitWorkspace>

      <!-- 选项卡右键菜单：基础层 WorkbenchTabMenu（通用项，默认英文文案） -->
      <WorkbenchTabMenu
        :visible="showTabMenu"
        :position="tabMenuPosition"
        :pinned="rightClickedTab ? isPinned(rightClickedTab.id) : false"
        @close="onMenuClose"
        @close-other="closeOtherTabsForPanel"
        @close-left="closeLeftTabsForPanel"
        @close-right="closeRightTabsForPanel"
        @close-all="closeAllTabsForPanel"
        @move-to-first="moveTabToFirst"
        @move-to-last="moveTabToLast"
        @toggle-pin="togglePinContext"
        @hide="hideTabMenu"
      >
        <!-- 分屏入口：拖拽标签到右侧区域也可触发分屏 -->
        <template #middle>
          <div v-if="canSplit" class="menu-item" @click="handleSplitToNewPanel">
            Split to New Panel
          </div>
        </template>
      </WorkbenchTabMenu>

      <!-- 内容池：所有视图组件在此渲染，通过 Teleport 分发到所属面板（实例不销毁） -->
      <template v-for="tab in tabs" :key="tab.id">
        <Teleport :to="`#${contentDomId(getTabPanelId(tab.id))}`">
          <div v-show="isTabActiveInItsPanel(tab.id)" class="tab-content">
            <CounterPanel v-if="tab.id === 'counter'" />
            <SettingsTab v-else-if="tab.id === 'settings'" />
            <AboutPanel v-else-if="tab.id === 'about'" :app-name="appName" />
          </div>
        </Teleport>
      </template>
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
import SplitWorkspace from '@superx/foundation/workbench/SplitWorkspace.vue'
import { useSplitWorkspace } from '@superx/foundation/workbench/useSplitWorkspace'
import { useSplitPanelController } from '@superx/foundation/workbench/useSplitPanelController'
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
type ViewId = (typeof navItems)[number]['id']

// ----- sidebar footer menu (foundation SidebarFooter) -----
const sidebarMenuItems = [
  { id: 'settings', label: 'Settings' },
  { id: 'about', label: 'About' }
]

const handleSidebarCommand = (command: string): void => {
  openView(command)
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
const withPinState = (list: WorkbenchTab[]): WorkbenchTab[] =>
  list.map((t) => ({ ...t, pinned: isPinned(t.id) }))

// ----- 分屏工作区（基础层 useSplitWorkspace + useSplitPanelController） -----
const { splitState, splitPanel, switchPanelTab, updateSplitRatio } = useSplitWorkspace()
const splitRatio = computed(() => splitState.splitRatio)

const splitPanelCtrl = useSplitPanelController<WorkbenchTab>({
  tabs,
  getTabId: (t) => t.id,
  activeTabId,
  splitState,
  splitPanel,
  showTabMenu,
  rightClickedTab,
  hideTabMenu,
  closeTab: (tabId: string) => {
    // 面板限定的批量关闭经此回调，保持「固定标签不被批量关闭」的语义
    if (!isPinned(tabId)) removeTab(tabId)
  }
})
const {
  isSplit,
  getTabPanelId,
  isTabActiveInItsPanel,
  handleSplitToNewPanel,
  handleTabDropToPane,
  closeOtherTabsForPanel,
  closeLeftTabsForPanel,
  closeRightTabsForPanel,
  closeAllTabsForPanel
} = splitPanelCtrl

const contentDomId = (panelId: string): string => `content-${panelId}`

// 各面板显示用的 tab 列表（panel-0 排除已分屏到其他面板的 tab）
const panel0DisplayTabs = computed(() => withPinState(splitPanelCtrl.getPanel0Tabs()))
const panelDisplayTabs = (panel: { id: string; tabIds: string[] }): WorkbenchTab[] =>
  withPinState(splitPanelCtrl.getPanelTabs(panel))

// 右键菜单的「分屏」入口：已分屏或 tab 不足时隐藏
const canSplit = computed(() => !isSplit.value && tabs.value.length > 1)

// 面板内选中 tab：同步面板激活项与全局激活项
const selectInPanel = (panelId: string, tabId: string): void => {
  switchPanelTab(panelId, tabId)
  activate(tabId)
}

// 右键菜单：记录所在面板后打开基础层菜单
const onTabContextMenuInPanel = (panelId: string, event: MouseEvent, tabId: string): void => {
  splitPanelCtrl.rightClickedPanelId.value = panelId
  const tab = tabs.value.find((t) => t.id === tabId)
  if (tab) openTabContextMenu(event, tab)
}

/** 打开（或激活）指定视图对应的选项卡：侧边栏 / 页脚菜单的统一入口 */
const openView = (id: string): void => {
  const existing = tabs.value.find((t) => t.id === id)
  if (existing) {
    activate(id)
    return
  }
  const label = navItems.find((item) => item.id === id)?.label ?? id
  tabsController.addTab(markRaw<WorkbenchTab>({ id, title: label }))
}

// 默认打开全部视图选项卡，激活第一个
onMounted(() => {
  for (const item of navItems) {
    tabsController.addTab(markRaw<WorkbenchTab>({ id: item.id, title: item.label }))
  }
  activate(navItems[0].id)
})

const onCloseTab = (tabId: string): void => {
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

// ----- tab context menu actions -----
const onMenuClose = (): void => {
  const id = rightClickedTab.value?.id
  if (id !== undefined) onCloseTab(String(id))
  hideTabMenu()
}

// ----- window controls (custom titlebar buttons → IPC → main) -----
// 逻辑在 @superx/foundation 的 useWindowControls，这里只注入 preload 桥接
const { isMaximized, minimize: minimizeWindow, toggleMaximize: toggleMaximizeWindow, close: closeWindow } =
  useWindowControls(window.api.window)

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
  min-height: 0;
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

.panel {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-content {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.tab-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, #888);
  font-size: 13px;
  user-select: none;
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
