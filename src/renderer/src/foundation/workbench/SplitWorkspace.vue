<template>
  <div ref="containerRef" class="split-workspace" @dragover="onContainerDragOver" @dragleave="onContainerDragLeave" @drop="onContainerDrop">
    <div ref="leftPaneRef" class="split-pane" :style="leftPaneStyle"><slot name="left" /></div>
    <div v-if="isSplit" class="split-resizer" :class="{ resizing: isResizing }" @mousedown="startResize" />
    <div v-if="isSplit" ref="rightPaneRef" class="split-pane" :style="rightPaneStyle"><slot name="right" /></div>
    <div v-if="!isSplit" class="split-drop-zone" :class="{ active: dropZone === 'right' }">
      <div class="drop-zone-hint"><span class="drop-zone-icon">⇢</span><span>{{ dropHint }}</span></div>
    </div>
    <div v-if="isSplit && dropZone" class="split-drop-zone split-mode active" :style="dropZoneStyle">
      <div class="drop-zone-hint"><span class="drop-zone-icon">⇢</span><span>{{ dropHint }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { WORKBENCH_TAB_DRAG_MIME, WORKBENCH_TAB_SOURCE_PANEL_MIME } from '../../../../shared/workbench/types'
import { getActiveWorkbenchDragSourcePanelId } from './useWorkbenchTabDrag'

const props = withDefaults(defineProps<{
  isSplit: boolean
  splitRatio: number
  dropHint?: string
  rootPanelId?: string
}>(), {
  dropHint: 'Drop tab to split',
  rootPanelId: 'panel-0'
})
const emit = defineEmits<{
  updateSplitRatio: [ratio: number]
  tabDropToPane: [tabId: string, sourcePanelId: string, targetZone: 'left' | 'right']
}>()

const containerRef = ref<HTMLElement | null>(null)
const leftPaneRef = ref<HTMLElement | null>(null)
const rightPaneRef = ref<HTMLElement | null>(null)
const isResizing = ref(false)
const dropZone = ref<'left' | 'right' | null>(null)
let resizeStartX = 0
let startRatio = 0

const leftPaneStyle = computed(() => !props.isSplit
  ? { flex: '1 1 0%', minWidth: '0' }
  : { flex: `0 0 ${props.splitRatio * 100}%`, minWidth: '100px' })
const rightPaneStyle = computed(() => ({ flex: '1 1 0%', minWidth: '100px' }))
const dropZoneStyle = computed(() => {
  if (!dropZone.value) return {}
  return dropZone.value === 'left'
    ? { left: '0', right: 'auto', width: `${props.splitRatio * 100}%`, margin: '4px' }
    : { left: 'auto', right: '0', width: `${(1 - props.splitRatio) * 100}%`, margin: '4px' }
})

const startResize = (event: MouseEvent): void => {
  event.preventDefault()
  isResizing.value = true
  resizeStartX = event.clientX
  startRatio = props.splitRatio
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
}
const onResize = (event: MouseEvent): void => {
  if (!isResizing.value || !containerRef.value) return
  const width = containerRef.value.getBoundingClientRect().width
  if (width > 0) emit('updateSplitRatio', Math.max(0.1, Math.min(0.9, startRatio + (event.clientX - resizeStartX) / width)))
}
const stopResize = (): void => {
  if (!isResizing.value) return
  isResizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
}
const onContainerDragOver = (event: DragEvent): void => {
  if (!event.dataTransfer?.types.includes(WORKBENCH_TAB_DRAG_MIME) || !containerRef.value) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  const rect = containerRef.value.getBoundingClientRect()
  if (!props.isSplit) {
    dropZone.value = event.clientX >= rect.right - rect.width * 0.35 ? 'right' : null
    return
  }
  const zone = event.clientX < rect.left + rect.width * props.splitRatio ? 'left' : 'right'
  const sourcePanelId = getActiveWorkbenchDragSourcePanelId() || props.rootPanelId
  const samePanel = (zone === 'left' && sourcePanelId === props.rootPanelId) || (zone === 'right' && sourcePanelId !== props.rootPanelId)
  dropZone.value = samePanel ? null : zone
}
const onContainerDragLeave = (event: DragEvent): void => {
  if (containerRef.value && !containerRef.value.contains(event.relatedTarget as Node | null)) dropZone.value = null
}
const onContainerDrop = (event: DragEvent): void => {
  if (!event.dataTransfer?.types.includes(WORKBENCH_TAB_DRAG_MIME)) return
  event.preventDefault()
  event.stopPropagation()
  const tabId = event.dataTransfer.getData(WORKBENCH_TAB_DRAG_MIME)
  const sourcePanelId = event.dataTransfer.getData(WORKBENCH_TAB_SOURCE_PANEL_MIME) || props.rootPanelId
  const targetZone = dropZone.value
  dropZone.value = null
  if (tabId && targetZone) emit('tabDropToPane', tabId, sourcePanelId, targetZone)
}

defineExpose({ getLeftContainer: () => leftPaneRef.value, getRightContainer: () => rightPaneRef.value })
</script>

<style scoped>
.split-workspace { display: flex; width: 100%; height: 100%; flex: 1; overflow: hidden; position: relative; user-select: none; }
.split-pane { display: flex; flex-direction: column; position: relative; overflow: hidden; }
.split-resizer { width: 3px; height: 100%; background: var(--split-resizer-bg); cursor: col-resize; flex-shrink: 0; z-index: 100; transition: background-color .2s; margin: 0 -1px; }
.split-resizer:hover, .split-resizer.resizing { background: var(--split-resizer-hover); }
.split-drop-zone { position: absolute; top: 0; right: 0; bottom: 0; width: 35%; min-width: 150px; z-index: 50; pointer-events: none; display: flex; align-items: center; justify-content: center; border: 2px dashed transparent; border-radius: 6px; margin: 4px; }
.split-drop-zone.active { background-color: var(--split-drop-zone-bg); border-color: var(--split-drop-zone-border); }
.split-mode { width: auto; min-width: auto; z-index: 55; }
.drop-zone-hint { display: none; flex-direction: column; align-items: center; gap: 6px; color: var(--split-drop-zone-text); font-size: 13px; }
.split-drop-zone.active .drop-zone-hint { display: flex; }
.drop-zone-icon { font-size: 28px; line-height: 1; }
</style>
