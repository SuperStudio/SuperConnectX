<template>
  <div v-if="tabs.length > 0" class="workbench-tab-bar">
    <div ref="tabsHeaderRef" class="tabs-header" @wheel="handleTabsWheel">
      <div class="tabs-nav" @contextmenu="$emit('tabsNavContextMenu', $event)">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-item"
          :class="{
            active: activeTabId === tab.id,
            pinned: tab.pinned,
            dragging: dragState.draggingId === tab.id,
            'drag-over': dragState.overId === tab.id,
            'drag-over-before': dragState.overId === tab.id && dragState.dropPosition === 'before'
          }"
          :draggable="true"
          :data-tab-id="tab.id"
          @mousedown="onTabMouseDown($event, tab.id)"
          @click="$emit('selectTab', tab.id); $emit('hideTabMenu')"
          @contextmenu="$emit('tabContextMenu', $event, tab.id)"
          @dragstart="onDragStart($event, tab.id)"
          @dragover="onDragOver($event, tab.id)"
          @dragenter.prevent="onDragEnter($event, tab.id)"
          @dragleave="onDragLeave($event, tab.id)"
          @drop="onDrop($event, tab.id)"
          @dragend="resetDragState"
        >
          <span class="tab-icon"><slot name="icon" :tab="tab" /></span>
          <slot name="status" :tab="tab" />
          <span class="tab-name"><slot name="title" :tab="tab">{{ tab.title }}</slot></span>
          <slot name="action" :tab="tab">
            <button
              class="tab-action-btn"
              :class="{ pinned: tab.pinned }"
              type="button"
              :aria-label="tab.pinned ? 'Unpin tab' : 'Pin tab'"
              @click.stop="$emit('togglePin', tab.id)"
            />
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { WorkbenchTab } from '../../../../shared/workbench/types'
import { useWorkbenchTabDrag } from './useWorkbenchTabDrag'

const props = defineProps<{
  tabs: WorkbenchTab[]
  activeTabId: string
  panelId: string
}>()

const emit = defineEmits<{
  selectTab: [tabId: string]
  hideTabMenu: []
  tabsNavContextMenu: [event: MouseEvent]
  tabContextMenu: [event: MouseEvent, tabId: string]
  togglePin: [tabId: string]
  reorderTabs: [fromId: string, targetId: string, position: 'before' | 'after', toPinned: boolean]
}>()

const tabsHeaderRef = ref<HTMLElement | null>(null)
const { dragState, onDragStart, onDragOver, onDragEnter, onDragLeave, onDrop, resetDragState } = useWorkbenchTabDrag({
  panelId: props.panelId,
  isPinned: tabId => props.tabs.some(tab => tab.id === tabId && tab.pinned === true),
  onReorder: (fromId, targetId, position, toPinned) => emit('reorderTabs', fromId, targetId, position, toPinned)
})

const handleTabsWheel = (event: WheelEvent): void => {
  if (!tabsHeaderRef.value) return
  event.preventDefault()
  tabsHeaderRef.value.scrollLeft += event.deltaY
}

const onTabMouseDown = (event: MouseEvent, tabId: string): void => {
  if (event.button !== 0) return
  emit('selectTab', tabId)
  emit('hideTabMenu')
}
</script>

<style scoped>
.workbench-tab-bar {
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-primary);
  flex-shrink: 0;
}

.tabs-header {
  height: 32px;
  background: var(--bg-secondary);
  flex-shrink: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-gutter: stable;
}

.tabs-header::-webkit-scrollbar { height: 4px; }
.tabs-header::-webkit-scrollbar-track { background: transparent; }
.tabs-header::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb-dark); border-radius: 2px; }
.tabs-header::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-dark-hover); }

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
  max-width: 200px;
  height: 100%;
  background-color: var(--tab-bg);
  color: var(--tab-text);
  cursor: pointer;
  user-select: none;
  position: relative;
  border-right: 1px solid var(--tab-border);
}

.tab-item:hover { background-color: var(--tab-hover-bg); }
.tab-item.active { background-color: var(--bg-primary); color: var(--tab-active-icon); }
.tab-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 14px; height: 14px; margin-right: 4px; color: var(--tab-icon); }
.tab-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; line-height: 1; font-size: 14px; }

.tab-action-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.15s;
  cursor: pointer;
  background: transparent;
}
.tab-action-btn::before { content: '×'; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-size: 14px; line-height: 1; color: var(--tab-close); }
.tab-action-btn.pinned { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024' fill='%23888'%3E%3Cpath d='M963.925333 326.997333L697.002667 60.074667a25.6 25.6 0 0 0-43.52 21.845333l14.506666 99.498667-273.066666 151.381333c-91.477333-45.738667-170.666667-36.693333-234.496 27.306667a25.941333 25.941333 0 0 0 0 36.352L327.68 563.2 57.685333 930.645333a25.6 25.6 0 0 0 35.84 35.669334l366.250667-270.677334 167.765333 167.936a25.941333 25.941333 0 0 0 36.352 0c79.530667-79.701333 58.538667-165.546667 26.965334-233.813333l152.064-273.066667 99.157333 14.165334a25.6 25.6 0 0 0 26.624-13.824 25.941333 25.941333 0 0 0-4.778667-30.037334z'/%3E%3C/svg%3E"); background-size: 12px; background-position: center; background-repeat: no-repeat; }
.tab-action-btn.pinned::before { display: none; }
.tab-item:hover .tab-action-btn, .tab-item.active .tab-action-btn, .tab-item.pinned .tab-action-btn { opacity: 1; }
.tab-action-btn:hover { background-color: var(--tab-close-hover-bg); }
.tab-action-btn:hover::before { color: var(--tab-active-icon); }

.tab-item.dragging { opacity: 0.4; }
.tab-item.drag-over { position: relative; }
.tab-item.drag-over-before::before, .tab-item.drag-over:not(.drag-over-before)::after { content: ''; position: absolute; top: 0; bottom: 0; width: 2px; background-color: var(--tab-drag-indicator); z-index: 10; }
.tab-item.drag-over-before::before { left: 0; }
.tab-item.drag-over:not(.drag-over-before)::after { right: -1px; }
</style>
