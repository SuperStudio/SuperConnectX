<template>
  <div class="settings-json-editor">
    <div ref="containerRef" class="settings-json-editor-host" />
    <div v-if="loading" class="settings-json-editor-mask">{{ t('settings.jsonLoading') }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { getMonacoTheme } from '../../utils/MonacoTheme'

const props = withDefaults(defineProps<{
  /** Current settings document, rendered as formatted JSON. */
  text: string
  readOnly?: boolean
  /** Debounce applied to change events while typing. */
  debounce?: number
}>(), {
  readOnly: false,
  debounce: 250
})

const emit = defineEmits<{ change: [text: string] }>()

const { t } = useI18n()

type MonacoModule = typeof import('monaco-editor')

const containerRef = ref<HTMLElement | null>(null)
const loading = ref(true)

let monacoModule: MonacoModule | null = null
let editor: import('monaco-editor').editor.IStandaloneCodeEditor | null = null
let model: import('monaco-editor').editor.ITextModel | null = null
let changeSub: { dispose: () => void } | null = null
let themeObserver: MutationObserver | null = null
/** Flag guarding the round-trip: text pushed from the host must not bounce back as a change. */
let syncingFromProps = false
let timer: ReturnType<typeof setTimeout> | null = null

const emitChange = (text: string) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    emit('change', text)
  }, props.debounce)
}

const initEditor = async () => {
  if (!containerRef.value) return
  monacoModule = await import('monaco-editor')
  const monaco = monacoModule

  model = monaco.editor.createModel(props.text, 'json')
  editor = monaco.editor.create(containerRef.value, {
    model,
    theme: getMonacoTheme(),
    language: 'json',
    automaticLayout: true,
    readOnly: props.readOnly,
    fontSize: 13,
    fontFamily: 'Consolas, "Courier New", monospace',
    minimap: { enabled: false },
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    tabSize: 2,
    insertSpaces: true,
    fixedOverflowWidgets: true,
    renderWhitespace: 'selection',
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 }
  })

  changeSub = editor.onDidChangeModelContent(() => {
    if (syncingFromProps) return
    emitChange(editor?.getValue() ?? '')
  })

  themeObserver = new MutationObserver(() => {
    monaco.editor.setTheme(getMonacoTheme())
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  loading.value = false
}

onMounted(() => {
  void initEditor()
})

onBeforeUnmount(() => {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  changeSub?.dispose()
  changeSub = null
  themeObserver?.disconnect()
  themeObserver = null
  editor?.dispose()
  editor = null
  model?.dispose()
  model = null
})

// Keep the editor in sync when the host replaces the document (reset / external update).
watch(() => props.text, (next) => {
  if (!editor || editor.getValue() === next) return
  syncingFromProps = true
  const selection = editor.getSelection()
  editor.setValue(next)
  if (selection) editor.setSelection(selection)
  syncingFromProps = false
})

watch(() => props.readOnly, (value) => {
  editor?.updateOptions({ readOnly: value })
})
</script>

<style scoped>
.settings-json-editor {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  border: 1px solid var(--border-input, var(--border-primary));
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-input, transparent);
}

.settings-json-editor-host {
  flex: 1;
  min-height: 0;
}

/* 不展示 Monaco 自带的悬浮提示（查找框按钮等）：
   - monaco-hover / hover-content 是气泡本体
   - monaco-resizable-hover / monaco-sash 是可拖拽外壳与把手
   - workbench-hover-container / workbench-hover-pointer 是 tooltip 容器与其定位小箭头
     （气泡隐藏后 pointer 仍会渲染出一个 5x5 旋转方块，视觉上就是残留的小箭头） */
.settings-json-editor :deep(.monaco-resizable-hover),
.settings-json-editor :deep(.monaco-hover),
.settings-json-editor :deep(.monaco-hover-content),
.settings-json-editor :deep(.monaco-sash),
.settings-json-editor :deep(.workbench-hover-container),
.settings-json-editor :deep(.workbench-hover-pointer) {
  display: none !important;
}

.settings-json-editor-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--text-muted, #888);
  background: var(--bg-secondary, transparent);
}
</style>
