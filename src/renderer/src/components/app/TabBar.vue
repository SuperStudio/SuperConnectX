<template>
  <WorkbenchTabBar
    :tabs="workbenchTabs"
    :active-tab-id="activeTabId"
    :panel-id="panelId"
    @select-tab="id => { $emit('switchTab', id); $emit('hideTabMenu') }"
    @hide-tab-menu="$emit('hideTabMenu')"
    @tabs-nav-context-menu="$emit('tabsNavContextMenu', $event)"
    @tab-context-menu="(event, id) => $emit('tabContextMenu', event, getConnectionTab(id))"
    @toggle-pin="id => $emit('togglePinByButton', id)"
    @reorder-tabs="(fromId, targetId, position, toPinned) => $emit('reorderTabsWithPin', fromId, targetId, position, toPinned)"
  >
    <template #icon="{ tab: workbenchTab }">
      <template v-if="getConnectionTab(workbenchTab.id)">
        <el-icon v-if="getConnectionTab(workbenchTab.id).connectionType === 'telnet'" :size="14"><Monitor /></el-icon>
        <el-icon v-else-if="getConnectionTab(workbenchTab.id).connectionType === 'ssh'" :size="14"><Lock /></el-icon>
        <el-icon v-else-if="getConnectionTab(workbenchTab.id).connectionType === 'ftp'" :size="14"><FolderOpened /></el-icon>
        <el-icon v-else-if="getConnectionTab(workbenchTab.id).connectionType === 'com'" :size="14"><Cpu /></el-icon>
        <el-icon v-else-if="getConnectionTab(workbenchTab.id).connectionType === 'commandEditor'" :size="14"><EditPen /></el-icon>
        <el-icon v-else-if="getConnectionTab(workbenchTab.id).connectionType === 'shortcuts'" :size="14"><Operation /></el-icon>
        <el-icon v-else-if="getConnectionTab(workbenchTab.id).connectionType === 'settings'" :size="14"><Setting /></el-icon>
      </template>
    </template>
    <template #status="{ tab: workbenchTab }">
      <span v-if="getConnectionTab(workbenchTab.id)" v-show="!['commandEditor', 'shortcuts', 'settings', 'virtualPort'].includes(getConnectionTab(workbenchTab.id).connectionType)" class="connection-dot" :class="getConnectionStatus(getConnectionTab(workbenchTab.id))" />
    </template>
    <template #title="{ tab: workbenchTab }">
      <template v-if="getConnectionTab(workbenchTab.id)">
        <el-tooltip :content="getTitle(getConnectionTab(workbenchTab.id))" placement="top" effect="dark" :enterable="false" :show-after="TOOLTIP_SHOW_AFTER">
          <span class="tab-title-content">
            {{ getTitle(getConnectionTab(workbenchTab.id)) }}
            <el-tooltip v-if="getConnectionTab(workbenchTab.id).connectionType === 'com' && getConnectionTab(workbenchTab.id).comName && serialRemarks[getConnectionTab(workbenchTab.id).comName]" :content="serialRemarks[getConnectionTab(workbenchTab.id).comName]" placement="top" effect="dark" :enterable="false" :show-after="TOOLTIP_SHOW_AFTER">
              <span class="tab-remark">{{ serialRemarks[getConnectionTab(workbenchTab.id).comName] }}</span>
            </el-tooltip>
          </span>
        </el-tooltip>
      </template>
    </template>
    <template #action="{ tab: workbenchTab }">
      <el-tooltip :content="workbenchTab.pinned ? $t('tabs.unpin') : $t('tabs.close')" placement="top" effect="dark" :enterable="false" :show-after="TOOLTIP_SHOW_AFTER">
        <span class="tab-action-btn" :class="{ pinned: workbenchTab.pinned }" @click.stop="$emit('togglePinByButton', workbenchTab.id)" />
      </el-tooltip>
    </template>
  </WorkbenchTabBar>

  <Teleport to="body">
    <div v-if="showTabMenu" class="context-menu" :style="{ left: tabMenuPosition.x + 'px', top: tabMenuPosition.y + 'px' }" @click.stop>
      <div v-if="hasAnyConnected" class="menu-item" @click="$emit('disconnectAll')">{{ $t('tabs.disconnectAll') }}</div>
      <div v-else class="menu-item" @click="$emit('connectAll')">{{ $t('tabs.connectAll') }}</div>
      <div class="menu-divider" />
      <div class="menu-item" @click="$emit('closeSingle', rightClickedTab)">{{ $t('tabs.close') }}</div>
      <div class="menu-item" @click="$emit('closeOther')">{{ $t('tabs.closeOther') }}</div>
      <div class="menu-item" @click="$emit('closeLeft')">{{ $t('tabs.closeLeft') }}</div>
      <div class="menu-item" @click="$emit('closeRight')">{{ $t('tabs.closeRight') }}</div>
      <div class="menu-item danger" @click="$emit('closeAll')">{{ $t('tabs.closeAll') }}</div>
      <div class="menu-divider" />
      <div class="menu-item" @click="$emit('moveToFirst')">{{ $t('tabs.moveToFirst') }}</div>
      <div class="menu-item" @click="$emit('moveToLast')">{{ $t('tabs.moveToLast') }}</div>
      <div class="menu-divider" />
      <div class="menu-item" @click="$emit('splitToNewPanel')">{{ $t('tabs.splitToNewPanel') }}</div>
      <div class="menu-divider" />
      <div class="menu-item" @click="$emit('togglePin')">{{ pinnedTabs.has(rightClickedTab?.id) ? $t('tabs.unpin') : $t('tabs.pin') }}</div>
      <template v-if="rightClickedTab?.connectionType === 'com'">
        <div class="menu-divider" />
        <div class="menu-item" @click="$emit('openRemarkDialog')">{{ $t('tabs.editRemark') }}</div>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WorkbenchTab } from '../../../../shared/workbench/types'
import { TOOLTIP_SHOW_AFTER } from '../../utils/constants'
import WorkbenchTabBar from '../../foundation/workbench/WorkbenchTabBar.vue'

const props = defineProps<{
  connectionTabs: any[]
  activeTabId: string
  pinnedTabs: Set<string>
  showTabMenu: boolean
  tabMenuPosition: { x: number; y: number }
  rightClickedTab: any
  hasAnyConnected: boolean
  serialRemarks: Record<string, string>
  getConnectionStatus: (tab: any) => string
  panelId: string
}>()

defineEmits<{
  switchTab: [tabId: string | number]
  hideTabMenu: []
  tabsNavContextMenu: [event: MouseEvent]
  tabContextMenu: [event: MouseEvent, tab: any]
  togglePinByButton: [tabId: string | number]
  disconnectAll: []
  connectAll: []
  closeSingle: [tab: any]
  closeOther: []
  closeLeft: []
  closeRight: []
  closeAll: []
  moveToFirst: []
  moveToLast: []
  splitToNewPanel: []
  togglePin: []
  openRemarkDialog: []
  reorderTabsWithPin: [fromId: string, targetId: string, dropPosition: string, toPin: boolean]
}>()

const getConnectionTab = (id: string): any => props.connectionTabs.find(tab => tab.id.toString() === id)
const getTitle = (tab: any): string => tab.name || `${tab.host || tab.comName}:${tab.port || ''}`
const workbenchTabs = computed<WorkbenchTab[]>(() => props.connectionTabs.map(tab => ({
  id: tab.id.toString(),
  title: getTitle(tab),
  pinned: props.pinnedTabs.has(tab.id)
})))
</script>

<style scoped>
.connection-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.connection-dot.connected { background-color: var(--connect-dot-connected); }
.connection-dot.disconnected { background-color: var(--connect-dot-disconnected); }
.tab-title-content { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tab-remark { color: var(--tab-remark); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: 4px; font-size: 12px; }
.tab-action-btn { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; border-radius: 3px; opacity: 0; transition: opacity 0.15s; cursor: pointer; background-size: contain; background-repeat: no-repeat; background-position: center; }
.tab-action-btn::before { content: '×'; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-size: 14px; line-height: 1; color: var(--tab-close); }
.tab-action-btn.pinned { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024' fill='%23888'%3E%3Cpath d='M963.925333 326.997333L697.002667 60.074667a25.6 25.6 0 0 0-43.52 21.845333l14.506666 99.498667-273.066666 151.381333c-91.477333-45.738667-170.666667-36.693333-234.496 27.306667a25.941333 25.941333 0 0 0 0 36.352L327.68 563.2 57.685333 930.645333a25.6 25.6 0 0 0 35.84 35.669334l366.250667-270.677334 167.765333 167.936a25.941333 25.941333 0 0 0 36.352 0c79.530667-79.701333 58.538667-165.546667 26.965334-233.813333l152.064-273.066667 99.157333 14.165334a25.6 25.6 0 0 0 26.624-13.824 25.941333 25.941333 0 0 0-4.778667-30.037334z'/%3E%3C/svg%3E"); background-size: 12px; background-position: center; background-repeat: no-repeat; }
.tab-action-btn.pinned::before { display: none; }
.tab-action-btn:hover { background-color: var(--tab-close-hover-bg); }
.tab-action-btn:hover::before { color: var(--tab-active-icon); }
:deep(.tab-item:hover .tab-action-btn), :deep(.tab-item.active .tab-action-btn), :deep(.tab-item.pinned .tab-action-btn) { opacity: 1; }
.context-menu { position: fixed; z-index: 9999; }
.context-menu .menu-item { font-size: 13px; color: var(--menu-item-color); transition: background-color 0.15s ease, color 0.15s ease; }
.context-menu .menu-item:hover { background-color: var(--menu-item-hover-bg); color: var(--menu-item-hover-color); }
.context-menu .menu-item.danger { color: var(--menu-danger-color); }
.context-menu .menu-item.danger:hover { background-color: var(--menu-danger-hover-bg); color: var(--menu-item-hover-color); }
</style>
