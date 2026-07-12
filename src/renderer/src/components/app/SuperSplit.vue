<template>
  <div
    class="super-split"
    ref="splitContainerRef"
    @dragover="onContainerDragOver"
    @dragleave="onContainerDragLeave"
    @drop="onContainerDrop"
  >
    <!-- 左面板容器 -->
    <div
      class="super-split-pane pane-left"
      :class="{ 'drop-zone-active': dropZoneActive === 'left' }"
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
      :class="{ 'drop-zone-active': dropZoneActive === 'right' }"
      :style="rightPaneStyle"
      ref="rightPaneRef"
    >
      <slot name="right" />
    </div>

    <!-- 未分屏时，右半区域的分屏 drop zone 提示层 -->
    <div
      v-if="!isSplit"
      class="super-split-drop-zone"
      :class="{ 'drop-zone-active': dropZoneActive === 'split-right' }"
    >
      <div class="drop-zone-hint">
        <span class="drop-zone-icon">⇢</span>
        <span class="drop-zone-text">{{ t('tabs.dragToSplit') }}</span>
      </div>
    </div>

    <!-- 已分屏时，drop zone 提示层（覆盖目标面板，与未分屏效果一致） -->
    <div
      v-if="isSplit && dropZoneActive"
      class="super-split-drop-zone split-mode"
      :class="{ 'drop-zone-active': true }"
      :style="dropZoneOverlayStyle"
    >
      <div class="drop-zone-hint">
        <span class="drop-zone-icon">⇢</span>
        <span class="drop-zone-text">{{ t('tabs.dragToSplit') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  isSplit: boolean
  splitRatio: number
}>()

const emit = defineEmits<{
  updateSplitRatio: [ratio: number]
  tabDropToPane: [tabId: string, sourcePanelId: string, targetZone: string]
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

// ---- 拖放分屏支持 ----
const dropZoneActive = ref<string | null>(null)

/** 已分屏时 drop zone overlay 的定位样式 */
const dropZoneOverlayStyle = computed(() => {
  if (!props.isSplit || !dropZoneActive.value) return {}
  if (dropZoneActive.value === 'left') {
    return {
      left: '0',
      right: 'auto',
      width: `${props.splitRatio * 100}%`,
      margin: '4px'
    }
  }
  // 'right' 或 'split-right'
  return {
    left: 'auto',
    right: '0',
    width: `${(1 - props.splitRatio) * 100}%`,
    margin: '4px'
  }
})

/**
 * 在父容器上统一处理 dragover，通过鼠标坐标判断所在区域
 */
const onContainerDragOver = (e: DragEvent) => {
  // 只接受带有 tabId 的拖拽（来自 TabBar 的拖拽）
  if (!e.dataTransfer?.types.includes('application/x-scx-tab')) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'

  if (!splitContainerRef.value) return

  const containerRect = splitContainerRef.value.getBoundingClientRect()
  const mouseX = e.clientX

  if (!props.isSplit) {
    // 未分屏：鼠标在右 35% 区域 → 显示分屏提示
    const splitThreshold = containerRect.right - containerRect.width * 0.35
    if (mouseX >= splitThreshold) {
      dropZoneActive.value = 'split-right'
    } else {
      dropZoneActive.value = null
    }
  } else {
    // 已分屏：判断在左面板还是右面板
    const resizerWidth = 3
    const splitX = containerRect.left + containerRect.width * props.splitRatio

    // 读取源面板 ID（dragover 中无法读取自定义 MIME 类型，通过 window 临时变量桥接）
    const sourcePanelId = (window as any).__scxDragSourcePanelId || 'panel-0'
    const targetZone = mouseX < splitX - resizerWidth / 2 ? 'left'
      : mouseX > splitX + resizerWidth / 2 ? 'right'
      : null

    if (targetZone) {
      // 判断目标区域是否和源面板相同
      const isSamePanel = (targetZone === 'left' && sourcePanelId === 'panel-0')
        || (targetZone === 'right' && sourcePanelId !== 'panel-0')
      dropZoneActive.value = isSamePanel ? null : targetZone
    } else {
      dropZoneActive.value = null
    }
  }
}

const onContainerDragLeave = (e: DragEvent) => {
  // 仅当鼠标离开整个 super-split 容器时清除状态
  const relatedTarget = e.relatedTarget as HTMLElement
  const container = splitContainerRef.value
  if (container && !container.contains(relatedTarget)) {
    dropZoneActive.value = null
  }
}

const onContainerDrop = (e: DragEvent) => {
  if (!e.dataTransfer?.types.includes('application/x-scx-tab')) return
  e.preventDefault()
  e.stopPropagation()

  const tabId = e.dataTransfer?.getData('application/x-scx-tab')
  const sourcePanelId = e.dataTransfer?.getData('application/x-scx-source-panel') || 'panel-0'

  const zone = dropZoneActive.value
  dropZoneActive.value = null

  if (tabId && zone) {
    emit('tabDropToPane', tabId, sourcePanelId, zone)
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
  background: var(--split-resizer-bg);
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
  background-color: var(--split-resizer-hover);
}

/* ---- 拖放分屏 Drop Zone ---- */
/* 未分屏时右侧区域的分屏 drop zone 提示层 */
.super-split-drop-zone {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 35%;
  min-width: 150px;
  z-index: 50;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease, border 0.2s ease;
  border: 2px dashed transparent;
  border-radius: 6px;
  margin: 4px;
}

/* 当拖拽 tab 经过右侧区域时激活 */
.super-split-drop-zone.drop-zone-active {
  background-color: var(--split-drop-zone-bg);
  border-color: var(--split-drop-zone-border);
}

.super-split-drop-zone .drop-zone-hint {
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--split-drop-zone-text);
  font-size: 13px;
  user-select: none;
}

.super-split-drop-zone.drop-zone-active .drop-zone-hint {
  display: flex;
}

.super-split-drop-zone .drop-zone-icon {
  font-size: 28px;
  line-height: 1;
}

.super-split-drop-zone .drop-zone-text {
  white-space: nowrap;
}

/* 已分屏时面板的 drop zone 高亮 */
.super-split-pane.drop-zone-active {
  /* 已分屏时使用 overlay 层替代，此处保留为空以兼容 class 绑定 */
}

/* 分屏模式下的 overlay 提示层（覆盖目标面板） */
.super-split-drop-zone.split-mode {
  top: 0;
  bottom: 0;
  width: auto;
  min-width: auto;
  z-index: 55; /* 高于 pane 内容，低于 resizer */
}
</style>
