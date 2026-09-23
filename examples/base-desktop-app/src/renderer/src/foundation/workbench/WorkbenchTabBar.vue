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
          @click="$emit('selectTab', tab.id); $emit('hideTabMenu')"
          @contextmenu="$emit('tabContextMenu', $event, tab.id)"
          @dragstart="onDragStart($event, tab.id)"
          @dragover="onDragOver($event, tab.id)"
          @dragenter.prevent="onDragEnter($event, tab.id)"
          @dragleave="onDragLeave($event, tab.id)"
          @drop="onDrop($event, tab.id)"
          @dragend="resetDragState"
        >
          <span class="tab-name"><slot name="title" :tab="tab">{{ tab.title }}</slot></span>
          <slot name="action" :tab="tab">
            <button
              class="tab-action-btn"
              type="button"
              aria-label="Close tab"
              @click.stop="$emit('closeTab', tab.id)"
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

defineProps<{
  tabs: WorkbenchTab[]
  activeTabId: string
  panelId: string
}>()

const emit = defineEmits<{
  selectTab: [tabId: string]
  hideTabMenu: []
  tabsNavContextMenu: [event: MouseEvent]
  tabContextMenu: [event: MouseEvent, tabId: string]
  closeTab: [tabId: string]
  reorderTabs: [fromId: string, targetId: string, position: 'before' | 'after']
}>()

const tabsHeaderRef = ref<HTMLElement | null>(null)
const { dragState, onDragStart, onDragOver, onDragEnter, onDragLeave, onDrop, resetDragState } = useWorkbenchTabDrag({
  panelId: 'workbench-panel',
  isPinned: () => false,
  onReorder: (fromId, targetId, position) => emit('reorderTabs', fromId, targetId, position)
})

const handleTabsWheel = (event: WheelEvent): void => {
  if (!tabsHeaderRef.value) return
  event.preventDefault()
  tabsHeaderRef.value.scrollLeft += event.deltaY
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
  padding: 0 36px 0 12px;
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
.tab-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; line-height: 1; font-size: 14px; }

.tab-action-btn {
  position: absolute;
  right: 6px;
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
.tab-item:hover .tab-action-btn, .tab-item.active .tab-action-btn { opacity: 1; }
.tab-action-btn:hover { background-color: var(--tab-close-hover-bg); }
.tab-action-btn:hover::before { color: var(--tab-active-icon); }

.tab-item.dragging { opacity: 0.4; }
.tab-item.drag-over { position: relative; }
.tab-item.drag-over-before::before, .tab-item.drag-over:not(.drag-over-before)::after { content: ''; position: absolute; top: 0; bottom: 0; width: 2px; background-color: var(--tab-drag-indicator); z-index: 10; }
.tab-item.drag-over-before::before { left: 0; }
.tab-item.drag-over:not(.drag-over-before)::after { right: -1px; }
</style>
