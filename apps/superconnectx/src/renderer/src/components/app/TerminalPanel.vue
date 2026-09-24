<template>
  <div class="panel-inner" :data-panel-id="panelId">
    <!-- TabBar -->
    <TabBar
      :connection-tabs="panelTabs"
      :active-tab-id="activeTabId"
      :pinned-tabs="pinnedTabs"
      :show-tab-menu="showTabMenu"
      :tab-menu-position="tabMenuPosition"
      :right-clicked-tab="rightClickedTab"
      :has-any-connected="hasAnyConnected"
      :serial-remarks="serialRemarks"
      :get-connection-status="getConnectionStatus"
      :panel-id="panelId"
      @switchTab="(id) => $emit('switchTab', id)"
      @hideTabMenu="$emit('hideTabMenu')"
      @tabsNavContextMenu="$emit('tabsNavContextMenu', $event)"
      @tabContextMenu="(e, tab) => $emit('tabContextMenu', e, tab)"
      @togglePinByButton="$emit('togglePinByButton', $event)"
      @disconnectAll="$emit('disconnectAll')"
      @connectAll="$emit('connectAll')"
      @closeSingle="$emit('closeSingle', $event)"
      @closeOther="$emit('closeOther')"
      @closeLeft="$emit('closeLeft')"
      @closeRight="$emit('closeRight')"
      @closeAll="$emit('closeAll')"
      @moveToFirst="$emit('moveToFirst')"
      @moveToLast="$emit('moveToLast')"
      @reorderTabsWithPin="(fromId: any, targetId: any, pos: any, toPin: any) => $emit('reorderTabsWithPin', fromId, targetId, pos, toPin)"
      @splitToNewPanel="$emit('splitToNewPanel')"
      @togglePin="$emit('togglePin')"
      @openRemarkDialog="$emit('openRemarkDialog')"
    />

    <!-- 终端区域：父组件通过 default slot 传入终端组件 -->
    <!-- Teleport 目标：分屏时终端组件通过 Teleport 传送到此 -->
    <div class="panel-terminal-area" :id="`terminal-area-${panelId}`">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import TabBar from './TabBar.vue'

defineProps<{
  panelId: string
  panelTabs: any[]
  activeTabId: string
  pinnedTabs: Set<string>
  showTabMenu: boolean
  tabMenuPosition: { x: number; y: number }
  rightClickedTab: any
  hasAnyConnected: boolean
  serialRemarks: Record<string, string>
  getConnectionStatus: (tab: any) => string
}>()

defineEmits<{
  switchTab: [tabId: string | number]
  hideTabMenu: []
  tabsNavContextMenu: [e: MouseEvent]
  tabContextMenu: [e: MouseEvent, tab: any]
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
  reorderTabsWithPin: [fromId: string, targetId: string, dropPosition: string, toPin: boolean]
  splitToNewPanel: []
  togglePin: []
  openRemarkDialog: []
}>()
</script>

<style scoped>
.panel-inner {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.panel-terminal-area {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  position: relative;
}

/* 终端组件需要占满空间 */
.panel-terminal-area :deep(.terminal-component),
.panel-terminal-area :deep(.com-terminal),
.panel-terminal-area :deep(.telnet-terminal),
.panel-terminal-area :deep(.command-editor-terminal),
.panel-terminal-area :deep(.shortcuts-terminal),
.panel-terminal-area :deep(.settings-terminal) {
  width: 100%;
  height: 100%;
}
</style>
