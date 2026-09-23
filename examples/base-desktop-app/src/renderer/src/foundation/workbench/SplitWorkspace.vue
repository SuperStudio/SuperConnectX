<template>
  <div ref="containerRef" class="split-workspace">
    <div ref="leftPaneRef" class="split-pane" :style="leftPaneStyle"><slot name="left" /></div>
    <div v-if="isSplit" class="split-resizer" :class="{ resizing: isResizing }" @mousedown="startResize" />
    <div v-if="isSplit" ref="rightPaneRef" class="split-pane" :style="rightPaneStyle"><slot name="right" /></div>
    <div v-if="!isSplit" class="split-drop-zone" :class="{ active: dropZone === 'right' }">
      <div class="drop-zone-hint"><span class="drop-zone-icon">⇢</span><span>{{ dropHint }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  isSplit: boolean
  splitRatio: number
  dropHint?: string
  /** Optional id used by the parent to highlight a drop-zone side (e.g. 'right'). */
  dropZone?: string
}>(), {
  dropHint: 'Drop tab to split',
  dropZone: ''
})
const emit = defineEmits<{
  updateSplitRatio: [ratio: number]
}>()

const containerRef = ref<HTMLElement | null>(null)
const leftPaneRef = ref<HTMLElement | null>(null)
const rightPaneRef = ref<HTMLElement | null>(null)
const isResizing = ref(false)
let resizeStartX = 0
let startRatio = 0

const leftPaneStyle = computed(() => !props.isSplit
  ? { flex: '1 1 0%', minWidth: '0' }
  : { flex: `0 0 ${props.splitRatio * 100}%`, minWidth: '100px' })
const rightPaneStyle = computed(() => ({ flex: '1 1 0%', minWidth: '100px' }))

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

defineExpose({ getLeftContainer: () => leftPaneRef.value, getRightContainer: () => rightPaneRef.value })
</script>

<style scoped>
.split-workspace { display: flex; width: 100%; height: 100%; flex: 1; overflow: hidden; position: relative; user-select: none; }
.split-pane { display: flex; flex-direction: column; position: relative; overflow: hidden; }
.split-resizer { width: 3px; height: 100%; background: var(--split-resizer-bg); cursor: col-resize; flex-shrink: 0; z-index: 100; transition: background-color .2s; margin: 0 -1px; }
.split-resizer:hover, .split-resizer.resizing { background: var(--split-resizer-hover); }
.split-drop-zone { position: absolute; top: 0; right: 0; bottom: 0; width: 35%; min-width: 150px; z-index: 50; pointer-events: none; display: flex; align-items: center; justify-content: center; border: 2px dashed transparent; border-radius: 6px; margin: 4px; }
.split-drop-zone.active { background-color: var(--split-drop-zone-bg); border-color: var(--split-drop-zone-border); }
.drop-zone-hint { display: none; flex-direction: column; align-items: center; gap: 6px; color: var(--split-drop-zone-text); font-size: 13px; }
.split-drop-zone.active .drop-zone-hint { display: flex; }
.drop-zone-icon { font-size: 28px; line-height: 1; }
</style>
