<template>
  <div class="log-filter-panel" :style="{ width: panelWidth + 'px' }" @mousedown.stop @click.stop>
    <!-- 左侧拖拽分隔条，用于调整面板宽度 -->
    <div class="filter-resizer" @mousedown.stop.prevent="onResizeStart"></div>
    <div class="filter-header">
      <el-input
        ref="filterInputRef"
        v-model="pattern"
        size="small"
        :placeholder="t('terminal.logFilterPlaceholder')"
        clearable
        class="filter-input"
        @input="onPatternInput"
        @keyup.enter="locateNext"
      />
      <el-button size="small" class="filter-close-btn" @click="emit('update:visible', false)">
        <el-icon :size="13"><Close /></el-icon>
      </el-button>
    </div>

    <div v-if="regexError" class="filter-error">{{ regexError }}</div>

    <div class="filter-count">
      <span>{{ t('terminal.logFilterMatch', { count: matchedLines.length, total: lines.length }) }}</span>
      <div class="filter-nav" v-if="matchedLines.length > 0">
        <el-button size="small" class="filter-icon-btn" @click="locatePrev">
          <el-icon :size="13"><ArrowUp /></el-icon>
        </el-button>
        <el-button size="small" class="filter-icon-btn" @click="locateNext">
          <el-icon :size="13"><ArrowDown /></el-icon>
        </el-button>
      </div>
    </div>

    <div class="filter-list" ref="listRef">
      <template v-if="matchedLines.length > 0">
        <div
          v-for="line in matchedLines"
          :key="line.lineNumber"
          class="filter-item"
          :class="{ 'filter-item-active': line.lineNumber === activeLineNumber }"
          @click="locateLine(line.lineNumber)"
        >
          <span class="filter-item-num">{{ line.lineNumber }}</span>
          <span class="filter-item-text">
            <template v-for="(seg, i) in highlightSegments(line.text)" :key="i">
              <mark v-if="seg.matched" class="filter-item-match">{{ seg.text }}</mark>
              <template v-else>{{ seg.text }}</template>
            </template>
          </span>
        </div>
      </template>
      <div v-else-if="pattern.trim()" class="filter-empty">{{ t('terminal.logFilterNoMatch') }}</div>
      <div v-else class="filter-empty">{{ t('terminal.logFilterHint') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Close, ArrowUp, ArrowDown } from '@element-plus/icons-vue'

const { t } = useI18n()

// 面板宽度（可拖拽调整）
const MIN_PANEL_WIDTH = 240
const MAX_PANEL_WIDTH = 800
const panelWidth = ref(300)

// 拖拽调整面板宽度
let resizeStartX = 0
let resizeStartWidth = 0
let isResizing = false

const onResizeStart = (e: MouseEvent) => {
  isResizing = true
  resizeStartX = e.clientX
  resizeStartWidth = panelWidth.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
}

const onResizeMove = (e: MouseEvent) => {
  if (!isResizing) return
  const delta = resizeStartX - e.clientX
  const width = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, resizeStartWidth + delta))
  panelWidth.value = width
}

const onResizeEnd = () => {
  isResizing = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
}

onBeforeUnmount(() => {
  onResizeEnd()
})

interface LogFilterLine {
  lineNumber: number
  text: string
}

const props = defineProps<{
  visible: boolean
  lines: LogFilterLine[]
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  locate: [lineNumber: number]
}>()

const pattern = ref('')
const regexError = ref('')
// 当前选中的日志行号（用稳定行号而非索引跟踪，新日志加入时选中态不丢失）
const activeLineNumber = ref<number | null>(null)
const listRef = ref<HTMLElement | null>(null)
const filterInputRef = ref<{ focus: () => void } | null>(null)

// 编译后的正则必须是响应式 ref，否则 computed(matchedLines) 不会在输入时重新计算
const regex = ref<RegExp | null>(null)
// 带 g 标志的正则，用于行内多段匹配高亮（需每次重建以重置 lastIndex）
const regexGlobal = ref<RegExp | null>(null)

const compileRegex = () => {
  const raw = pattern.value.trim()
  if (!raw) {
    regex.value = null
    regexGlobal.value = null
    regexError.value = ''
    return
  }
  try {
    // 正则默认区分大小写；如需忽略大小写，用户可在正则中使用 (?i) 内联修饰符
    regex.value = new RegExp(raw)
    regexGlobal.value = new RegExp(raw, 'g')
    regexError.value = ''
  } catch (e: any) {
    regex.value = null
    regexGlobal.value = null
    regexError.value = e?.message || t('terminal.logFilterInvalidRegex')
  }
}

const onPatternInput = () => {
  compileRegex()
  activeLineNumber.value = null
}

const matchedLines = computed<LogFilterLine[]>(() => {
  const r = regex.value
  if (!r || !props.lines.length) return []
  const result: LogFilterLine[] = []
  for (const line of props.lines) {
    if (!line.text.trim()) continue
    r.lastIndex = 0
    if (r.test(line.text)) {
      result.push(line)
    }
  }
  return result
})

// 将一行文本拆分为「普通文本」与「匹配文本」片段数组，匹配片段用于黄色背景高亮
const highlightSegments = (text: string): { text: string; matched: boolean }[] => {
  const r = regexGlobal.value
  if (!r) return [{ text, matched: false }]
  const segments: { text: string; matched: boolean }[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  r.lastIndex = 0
  while ((match = r.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), matched: false })
    }
    segments.push({ text: match[0], matched: true })
    lastIndex = match.index + match[0].length
    // 避免空匹配导致无限循环
    if (match[0].length === 0) r.lastIndex++
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), matched: false })
  }
  return segments
}

// 结果变化时：若当前选中的行已不在结果中（如正则改变），则取消选中；否则保持选中态
watch(matchedLines, (lines) => {
  if (
    activeLineNumber.value !== null &&
    !lines.some((l) => l.lineNumber === activeLineNumber.value)
  ) {
    activeLineNumber.value = null
  }
})

const locateLine = (lineNumber: number) => {
  emit('locate', lineNumber)
  activeLineNumber.value = lineNumber
}

const scrollActiveIntoView = () => {
  nextTick(() => {
    const list = listRef.value
    if (!list) return
    const activeEl = list.querySelector('.filter-item-active') as HTMLElement | null
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  })
}

const locatePrev = () => {
  const lines = matchedLines.value
  const len = lines.length
  if (!len) return
  let idx = lines.findIndex((l) => l.lineNumber === activeLineNumber.value)
  if (idx < 0) idx = 0 // 未选中时从末尾开始
  idx = (idx - 1 + len) % len
  const line = lines[idx]
  activeLineNumber.value = line.lineNumber
  emit('locate', line.lineNumber)
  scrollActiveIntoView()
}

const locateNext = () => {
  const lines = matchedLines.value
  const len = lines.length
  if (!len) return
  let idx = lines.findIndex((l) => l.lineNumber === activeLineNumber.value)
  if (idx < 0) idx = -1 // 未选中时从开头开始
  idx = (idx + 1) % len
  const line = lines[idx]
  activeLineNumber.value = line.lineNumber
  emit('locate', line.lineNumber)
  scrollActiveIntoView()
}

// 打开面板时聚焦输入框
watch(
  () => props.visible,
  (val) => {
    if (val) {
      compileRegex()
      nextTick(() => {
        filterInputRef.value?.focus()
      })
    }
  }
)

// ===== 持久化：正则表达式内容 & 面板宽度 =====
let loaded = false // 防止加载时触发保存覆盖存储

const loadPersisted = async () => {
  try {
    const saved = await window.storageApi.getLogFilter()
    if (saved?.panelWidth) {
      panelWidth.value = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, saved.panelWidth))
    }
    if (saved?.pattern !== undefined) {
      pattern.value = saved.pattern
    }
  } catch (err) {
    console.error('load log-filter settings failed:', err)
  } finally {
    loaded = true
  }
}

const persist = async () => {
  if (!loaded) return
  try {
    await window.storageApi.saveLogFilter({
      pattern: pattern.value,
      panelWidth: panelWidth.value
    })
  } catch (err) {
    console.error('save log-filter settings failed:', err)
  }
}

// 面板宽度变化时保存（防抖）
let widthSaveTimer: ReturnType<typeof setTimeout> | null = null
watch(panelWidth, () => {
  if (widthSaveTimer) clearTimeout(widthSaveTimer)
  widthSaveTimer = setTimeout(persist, 300)
})

// 正则内容变化时保存
watch(pattern, persist)

onMounted(loadPersisted)
</script>

<style scoped>
.log-filter-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100%;
  background: var(--terminal-bg);
  border-left: 1px solid var(--vertical-splitter-bg);
  box-sizing: border-box;
}

/* 左侧拖拽分隔条 */
.filter-resizer {
  position: absolute;
  left: -3px;
  top: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}

.filter-resizer:hover {
  background: var(--vertical-splitter-bg);
}

.filter-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  flex-shrink: 0;
}

.filter-input {
  flex: 1;
  min-width: 0;
}

.filter-icon-btn {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  padding: 0 !important;
  border-radius: 4px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background-color: transparent !important;
  border: 1px solid transparent !important;
  color: var(--text-white) !important;
}

.filter-icon-btn:hover {
  background-color: var(--overlay-btn-hover) !important;
}

.filter-close-btn {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  padding: 0 !important;
  border-radius: 4px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background-color: transparent !important;
  border: 1px solid transparent !important;
  color: var(--text-white) !important;
}

.filter-close-btn:hover {
  background-color: var(--overlay-btn-hover) !important;
  color: var(--btn-danger-text) !important;
}

.filter-error {
  padding: 2px 12px 4px;
  font-size: 12px;
  color: var(--btn-danger-text);
  flex-shrink: 0;
  word-break: break-all;
}

.filter-count {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  border-top: 1px solid var(--vertical-splitter-bg);
  flex-shrink: 0;
}

.filter-nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

.filter-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px;
}

.filter-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 100%;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-family: 'Fira Code', 'Consolas', 'Ubuntu Mono', 'Noto Sans Mono CJK SC', monospace;
  font-size: 12px;
  white-space: nowrap;
  box-sizing: border-box;
}

.filter-item:hover {
  background: var(--history-item-hover-bg);
}

.filter-item-active {
  background: var(--terminal-control-auto-scroll-active) !important;
}

.filter-item-num {
  flex-shrink: 0;
  color: var(--text-secondary);
  min-width: 28px;
  text-align: right;
  user-select: none;
  font-family: 'Fira Code', 'Consolas', 'Ubuntu Mono', 'Noto Sans Mono CJK SC', monospace;
}

.filter-item-text {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  color: var(--text-white);
}

/* 匹配到的文本用黄色背景高亮 */
.filter-item-match {
  background: #ffd54f;
  color: #1f1f1f;
  padding: 0 1px;
  border-radius: 2px;
  font-family: inherit;
  white-space: nowrap;
}

.filter-empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.filter-list::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.filter-list::-webkit-scrollbar-track {
  background: transparent;
}

.filter-list::-webkit-scrollbar-thumb {
  background: var(--terminal-output-scrollbar-thumb);
  border-radius: 3px;
}

.filter-list::-webkit-scrollbar-corner {
  background: transparent;
}
</style>
