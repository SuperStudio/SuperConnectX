<template>
  <div v-if="connectionTabs.length > 0" class="custom-tabs">
    <div class="tabs-header" ref="tabsHeaderRef" @wheel="handleTabsWheel">
      <div class="tabs-nav" @contextmenu="$emit('tabsNavContextMenu', $event)">
        <div
          v-for="(tab, index) in connectionTabs"
          :key="tab.id"
          class="tab-item"
          :class="{
            active: activeTabId === tab.id.toString(),
            pinned: pinnedTabs.has(tab.id),
            dragging: dragState.draggingId === tab.id,
            'drag-over': dragState.overId === tab.id,
            'drag-over-before': dragState.overId === tab.id && dragState.dropPosition === 'before'
          }"
          :draggable="true"
          @mousedown="onTabMouseDown($event, tab)"
          @click="$emit('switchTab', tab.id); $emit('hideTabMenu')"
          @contextmenu="$emit('tabContextMenu', $event, tab)"
          @dragstart="onDragStart($event, tab, index)"
          @dragover="onDragOver($event, tab, index)"
          @dragenter.prevent="onDragEnter($event, tab)"
          @dragleave="onDragLeave($event, tab)"
          @drop="onDrop($event, tab)"
          @dragend="onDragEnd"
          :data-tab-id="tab.id"
        >
          <span class="tab-icon">
            <el-icon v-if="tab.connectionType === 'telnet'" :size="14"><Monitor /></el-icon>
            <el-icon v-else-if="tab.connectionType === 'ssh'" :size="14"><Lock /></el-icon>
            <el-icon v-else-if="tab.connectionType === 'ftp'" :size="14"><FolderOpened /></el-icon>
            <el-icon v-else-if="tab.connectionType === 'com'" :size="14"><Cpu /></el-icon>
            <el-icon v-else-if="tab.connectionType === 'commandEditor'" :size="14"><EditPen /></el-icon>
            <el-icon v-else-if="tab.connectionType === 'shortcuts'" :size="14"><Operation /></el-icon>
            <el-icon v-else-if="tab.connectionType === 'settings'" :size="14"><Setting /></el-icon>
          </span>
          <span
            v-if="tab.connectionType !== 'commandEditor' && tab.connectionType !== 'shortcuts' && tab.connectionType !== 'settings'"
            class="connection-dot"
            :class="getConnectionStatus(tab)"
          ></span>
          <el-tooltip :content="tab.name || `${tab.host || tab.comName}:${tab.port || ''}`" placement="top" effect="dark" :enterable="false">
            <span class="tab-name">
              {{ tab.name || `${tab.host || tab.comName}:${tab.port || ''}` }}
              <span v-if="tab.connectionType === 'com' && tab.comName && serialRemarks[tab.comName]" class="tab-remark">{{ serialRemarks[tab.comName] }}</span>
            </span>
          </el-tooltip>
          <el-tooltip :content="pinnedTabs.has(tab.id) ? $t('tabs.unpin') : $t('tabs.pin')" placement="top" effect="dark" :enterable="false">
            <span
              class="tab-action-btn"
              :class="{ pinned: pinnedTabs.has(tab.id) }"
              @click.stop="$emit('togglePinByButton', tab.id)"
            ></span>
          </el-tooltip>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="showTabMenu"
        class="context-menu"
        :style="{ left: tabMenuPosition.x + 'px', top: tabMenuPosition.y + 'px' }"
        @click.stop
      >
        <div v-if="hasAnyConnected" class="menu-item" @click="$emit('disconnectAll')">{{ $t('tabs.disconnectAll') }}</div>
        <div v-else class="menu-item" @click="$emit('connectAll')">{{ $t('tabs.connectAll') }}</div>
        <div class="menu-divider"></div>
        <div class="menu-item" @click="$emit('closeSingle', rightClickedTab)">{{ $t('tabs.close') }}</div>
        <div class="menu-item" @click="$emit('closeOther')">{{ $t('tabs.closeOther') }}</div>
        <div class="menu-item" @click="$emit('closeLeft')">{{ $t('tabs.closeLeft') }}</div>
        <div class="menu-item" @click="$emit('closeRight')">{{ $t('tabs.closeRight') }}</div>
        <div class="menu-item danger" @click="$emit('closeAll')">{{ $t('tabs.closeAll') }}</div>
        <div class="menu-divider"></div>
        <div class="menu-item" @click="$emit('moveToFirst')">{{ $t('tabs.moveToFirst') }}</div>
        <div class="menu-item" @click="$emit('moveToLast')">{{ $t('tabs.moveToLast') }}</div>
        <div class="menu-divider"></div>
        <div class="menu-item" @click="$emit('splitToNewPanel')">{{ $t('tabs.splitToNewPanel') }}</div>
        <div class="menu-divider"></div>
        <div class="menu-item" @click="$emit('togglePin')">
          {{ pinnedTabs.has(rightClickedTab?.id) ? $t('tabs.unpin') : $t('tabs.pin') }}
        </div>
        <template v-if="rightClickedTab?.connectionType === 'com'">
          <div class="menu-divider"></div>
          <div class="menu-item" @click="$emit('openRemarkDialog')">{{ $t('tabs.editRemark') }}</div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'

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
}>()

const emit = defineEmits<{
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
  splitToNewPanel: []
  togglePin: []
  openRemarkDialog: []
  reorderTabsWithPin: [fromId: string, targetId: string, dropPosition: string, toPin: boolean]
}>()

const tabsHeaderRef = ref<HTMLElement | null>(null)

// ---- 拖拽状态 ----
const dragState = reactive({
  draggingId: '' as string,
  draggingIndex: -1,
  overId: '' as string,
  dropPosition: '' as 'before' | 'after' | ''
})

const handleTabsWheel = (e: WheelEvent) => {
  if (tabsHeaderRef.value) {
    e.preventDefault()
    tabsHeaderRef.value.scrollLeft += e.deltaY
  }
}

// ---- 鼠标事件 ----
const onTabMouseDown = (e: MouseEvent, tab: any) => {
  // 仅左键按下时切换选项卡，右键不切换
  if (e.button !== 0) return
  emit('switchTab', tab.id)
  emit('hideTabMenu')
}

// ---- 拖拽事件处理 ----
const onDragStart = (e: DragEvent, tab: any, index: number) => {
  dragState.draggingId = tab.id
  dragState.draggingIndex = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tab.id)
    // 设置拖拽图像为半透明
    const el = e.target as HTMLElement
    if (el) {
      e.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2)
    }
  }
}

const onDragOver = (e: DragEvent, tab: any, _index: number) => {
  e.preventDefault()
  if (!dragState.draggingId || dragState.draggingId === tab.id) return
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'

  // 判断插入位置（鼠标在元素左半边还是右半边）
  const el = (e.currentTarget as HTMLElement)
  const rect = el.getBoundingClientRect()
  const midX = rect.left + rect.width / 2
  dragState.dropPosition = e.clientX < midX ? 'before' : 'after'
}

const onDragEnter = (e: DragEvent, tab: any) => {
  e.preventDefault()
  if (!dragState.draggingId || dragState.draggingId === tab.id) return
  dragState.overId = tab.id
}

const onDragLeave = (e: DragEvent, tab: any) => {
  // 只在真正离开元素时清除
  const relatedTarget = e.relatedTarget as HTMLElement
  const currentTarget = e.currentTarget as HTMLElement
  if (!currentTarget.contains(relatedTarget)) {
    if (dragState.overId === tab.id) {
      dragState.overId = ''
      dragState.dropPosition = ''
    }
  }
}

const onDrop = (e: DragEvent, tab: any) => {
  e.preventDefault()
  e.stopPropagation()
  if (!dragState.draggingId || dragState.draggingId === tab.id) {
    resetDragState()
    return
  }
  // 根据目标 tab 是否固定来决定拖拽 tab 是否固定
  const toPin = props.pinnedTabs.has(tab.id)
  emit('reorderTabsWithPin', dragState.draggingId, tab.id, dragState.dropPosition, toPin)
  resetDragState()
}

const onDragEnd = () => {
  resetDragState()
}

const resetDragState = () => {
  dragState.draggingId = ''
  dragState.draggingIndex = -1
  dragState.overId = ''
  dragState.dropPosition = ''
}
</script>

<style scoped>
/* 自定义选项卡样式 */
.custom-tabs {
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: #1e1e1e;
  flex-shrink: 0;
}

.tabs-header {
  height: 32px;
  background: #252526;
  flex-shrink: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-gutter: stable;
}

.tabs-header::-webkit-scrollbar {
  height: 4px;
}

.tabs-header::-webkit-scrollbar-track {
  background: transparent;
}

.tabs-header::-webkit-scrollbar-thumb {
  background: #464647;
  border-radius: 2px;
}

.tabs-header::-webkit-scrollbar-thumb:hover {
  background: #6f6f70;
}

.tabs-nav {
  display: flex;
  align-items: stretch;
  height: 100%;
  white-space: nowrap;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 36px 0 10px;
  min-width: 100px;
  max-width: 160px;
  height: 100%;
  background-color: #2d2d2d;
  color: #ccc;
  cursor: pointer;
  user-select: none;
  position: relative;
  border-right: 1px solid #1e1e1e;
}

.tab-item:hover {
  background-color: #353535;
}

.tab-item.active {
  background-color: #1e1e1e;
  color: #fff;
}

.tab-item .tab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-right: 4px;
  color: #888;
}

.tab-item.active .tab-icon {
  color: #fff;
}

.tab-item .tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  line-height: 1;
  font-size: 14px;
}

.tab-item .connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tab-item .connection-dot.connected {
  background-color: #18c138;
}

.tab-item .connection-dot.disconnected {
  background-color: #888888;
}

.tab-remark {
  color: #888;
  font-size: 12px;
  font-weight: normal;
  margin-left: 4px;
}

.tab-action-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.15s;
  cursor: pointer;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.tab-action-btn::before {
  content: '×';
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 14px;
  line-height: 1;
  color: #888;
}

.tab-action-btn.pinned {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024' fill='%23888'%3E%3Cpath d='M963.925333 326.997333L697.002667 60.074667a25.6 25.6 0 0 0-43.52 21.845333l14.506666 99.498667-273.066666 151.381333c-91.477333-45.738667-170.666667-36.693333-234.496 27.306667a25.941333 25.941333 0 0 0 0 36.352L327.68 563.2 57.685333 930.645333a25.6 25.6 0 0 0 35.84 35.669334l366.250667-270.677334 167.765333 167.936a25.941333 25.941333 0 0 0 36.352 0c79.530667-79.701333 58.538667-165.546667 26.965334-233.813333l152.064-273.066667 99.157333 14.165334a25.6 25.6 0 0 0 26.624-13.824 25.941333 25.941333 0 0 0-4.778667-30.037334z'/%3E%3C/svg%3E");
  background-size: 12px;
  background-position: center;
  background-repeat: no-repeat;
}

.tab-action-btn.pinned::before,
.tab-action-btn.pinned::after {
  display: none;
}

.tab-item:hover .tab-action-btn {
  opacity: 1;
}

.tab-item.active .tab-action-btn,
.tab-item.pinned .tab-action-btn {
  opacity: 1;
}

.tab-action-btn:hover {
  background-color: #3b3c3c;
}

.tab-action-btn:hover::before {
  color: #fff;
}

/* 拖拽排序样式 */
.tab-item.dragging {
  opacity: 0.4;
}

.tab-item.drag-over {
  position: relative;
}

.tab-item.drag-over-before::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: #007fd4;
  z-index: 10;
}

.tab-item.drag-over:not(.drag-over-before)::after {
  content: '';
  position: absolute;
  right: -1px;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: #007fd4;
  z-index: 10;
}

/* 右键菜单样式 */
.context-menu {
  position: fixed;
  z-index: 9999;
}

.context-menu .menu-item {
  font-size: 13px;
  color: var(--menu-item-color);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.context-menu .menu-item:hover {
  background-color: var(--menu-item-hover-bg);
  color: var(--menu-item-hover-color);
}

.context-menu .menu-item.danger {
  color: var(--menu-danger-color);
}

.context-menu .menu-item.danger:hover {
  background-color: var(--menu-danger-hover-bg);
  color: var(--menu-item-hover-color);
}
</style>
