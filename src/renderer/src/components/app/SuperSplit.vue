<template>
  <div class="super-split" ref="splitContainerRef">
    <!-- 左面板容器 -->
    <div
      class="super-split-pane pane-left"
      :style="leftPaneStyle"
      ref="leftPaneRef"
    >
      <slot name="left" />
    </div>

    <!-- 分隔条（分屏时显示） -->
    <div
      v-if="isSplit"
      class="super-split-resizer"
      :class="{ resizing: isResizing }"
      @mousedown="startResize"
    ></div>

    <!-- 右面板容器 -->
    <div
      v-if="isSplit"
      class="super-split-pane pane-right"
      :style="rightPaneStyle"
      ref="rightPaneRef"
    >
      <slot name="right" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  isSplit: boolean
  splitRatio: number
}>()

const emit = defineEmits<{
  updateSplitRatio: [ratio: number]
}>()

const splitContainerRef = ref<HTMLElement | null>(null)
const leftPaneRef = ref<HTMLElement | null>(null)
const rightPaneRef = ref<HTMLElement | null>(null)

// 左面板样式
const leftPaneStyle = computed(() => {
  if (!props.isSplit) {
    return { flex: '1 1 0%', minWidth: '0' }
  }
  return {
    flex: `0 0 ${props.splitRatio * 100}%`,
    minWidth: '100px'
  }
})

// 右面板样式
const rightPaneStyle = computed(() => {
  return {
    flex: `1 1 0%`,
    minWidth: '100px'
  }
})

// 拖拽调整大小
const isResizing = ref(false)
let resizeStartX = 0
let startRatio = 0

const startResize = (e: MouseEvent) => {
  e.preventDefault()
  isResizing.value = true
  resizeStartX = e.clientX
  startRatio = props.splitRatio

  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
}

const onResize = (e: MouseEvent) => {
  if (!isResizing.value) return

  const containerEl = splitContainerRef.value
  if (!containerEl) return

  const containerRect = containerEl.getBoundingClientRect()
  const totalWidth = containerRect.width
  const delta = e.clientX - resizeStartX
  const newRatio = startRatio + delta / totalWidth

  emit('updateSplitRatio', Math.max(0.1, Math.min(0.9, newRatio)))
}

const stopResize = () => {
  if (isResizing.value) {
    isResizing.value = false
    document.removeEventListener('mousemove', onResize)
    document.removeEventListener('mouseup', stopResize)
  }
}

// 暴露给父组件：用于 DOM 操作
const getLeftContainer = () => leftPaneRef.value
const getRightContainer = () => rightPaneRef.value

defineExpose({
  getLeftContainer,
  getRightContainer
})
</script>

<style scoped>
.super-split {
  display: flex;
  width: 100%;
  height: 100%;
  flex: 1;
  overflow: hidden;
  position: relative;
  user-select: none;
}

.super-split-pane {
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.super-split-resizer {
  width: 3px;
  height: 100%;
  background: #555;
  cursor: col-resize;
  flex-shrink: 0;
  z-index: 100;
  transition: background-color 0.2s;
  position: relative;
  user-select: none;
  margin-left: -1px;
  margin-right: -1px;
}

.super-split-resizer:hover,
.super-split-resizer.resizing {
  background-color: #409eff;
}
</style>
