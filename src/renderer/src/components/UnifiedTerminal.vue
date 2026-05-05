<template>
  <div class="unified-terminal">
    <!-- 终端输出区域 -->
    <div ref="editorContainer" class="terminal-output">
      <!-- 滚动按钮 -->
      <div class="scroll-wrapper">
        <el-button icon="ArrowUp" size="mini" circle @click="handleScrollToTop" class="scroll-btn up-btn" />
        <el-button icon="ArrowDown" size="mini" circle @click="handleScrollToBottom" class="scroll-btn down-btn" />
      </div>
    </div>

    <!-- 基础操作按钮 -->
    <TerminalControl
      :is-connected="isConnected"
      :is-connecting="isConnecting"
      :is-auto-scroll="isAutoScroll"
      :is-show-log="isShowLog"
      :rx-bytes="rxBytes"
      :tx-bytes="txBytes"
      @on-close="emit('onClose')"
      @on-reconnect="emit('onReconnect')"
      @on-clear-terminal="clearTerminal"
      @on-open-log="emit('onOpenLog')"
      @on-save-log="emit('onSaveLog')"
      @update:is-auto-scroll="isAutoScroll = $event"
      @update:is-show-log="isShowLog = $event"
    />

    <!-- 插槽：用于放置额外内容（如 Com 的波特率设置） -->
    <slot name="extra" />

    <!-- 命令组及命令 -->
    <div class="preset-commands-row">
      <PresetCommands
        :is-connected="isConnected"
        :connection="connection"
        ref="presetCommandsRef"
        @commandSent="handleCommandSent"
        @commandSentContent="appendCommandToTerminal"
        @openCommandEditor="(connectionType: string) => emit('onOpenCommandEditor', connectionType)"
      />
    </div>

    <!-- 命令输入区域 -->
    <div class="terminal-input">
      <div class="input-controls terminal-switch" v-if="connection?.connectionType === 'com'">
        <el-switch
          width="50"
          v-model="autoNewline"
          active-text="CRLF"
          inactive-text="CRLF"
          inline-prompt
          size="small"
          :disabled="!isConnected"
        />
        <el-switch
          width="50"
          v-model="hexMode"
          active-text="HEX"
          inactive-text="STR"
          inline-prompt
          size="small"
          :disabled="!isConnected"
        />
      </div>
      <span class="prompt">></span>
      <input
        v-model="currentCommand"
        @keydown.enter="handleSendCommand"
        :placeholder="isConnected ? (hexMode ? '输入HEX数据 (如: 01 02 03)' : placeholder) : '连接后可发送命令'"
        ref="commandInput"
        class="command-input"
        :class="{ 'not-connected': !isConnected, 'hex-mode': hexMode }"
        :disabled="!isConnected"
      />
      <el-button
        type="primary"
        icon="Promotion"
        size="small"
        class="send-btn"
        @click="handleSendCommand"
        :disabled="!isConnected"
      >
        发送
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as monaco from 'monaco-editor'
import PresetCommands from './PresetCommands.vue'
import TerminalControl from './TerminalControl.vue'

const MAX_CLEAR_INTERVAL_SIZE = 1024 * 1024 * 30

const props = withDefaults(defineProps<{
  connection: {
    id: number
    connectionType: string
    comName?: string
    host?: string
    port?: number
    name?: string
    sessionId: string
    [key: string]: any
  }
  isConnected?: boolean
  isConnecting?: boolean
  initMessage?: string
  placeholder?: string
  sessionIdPrefix?: string
}>(), {
  isConnected: false,
  isConnecting: false,
  initMessage: '等待连接...',
  placeholder: '输入命令并按回车发送...',
  sessionIdPrefix: 'terminal'
})

const emit = defineEmits<{
  onClose: []
  onReconnect: []
  onOpenLog: []
  onSaveLog: []
  onSend: [command: string]
  onCommandSent: [cmdName: string]
  onDataReceived: [data: string]
  'update:isConnected': [value: boolean]
  onOpenCommandEditor: [connectionType: string]
}>()

const currentCommand = ref('')
const rxBytes = ref('0 B')
const txBytes = ref('0 B')
const commandInput = ref<HTMLInputElement | null>(null)
const isConnected = ref(props.isConnected)
const isConnecting = ref(props.isConnecting)
const isAutoScroll = ref(true)
const isShowLog = ref(true)
const editorContainer = ref<HTMLElement | null>(null)
const autoNewline = ref(true) // 是否自动添加回车换行
const hexMode = ref(false) // 是否为HEX发送模式
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let editorModel: monaco.editor.ITextModel | null = null
let totalRecvSize = 0
let totalTxSize = 0
let isInternalChange = false // 标记是否由内部触发的 isAutoScroll 变化

const presetCommandsRef = ref<InstanceType<typeof PresetCommands>>()

watch(() => props.isConnected, (val) => {
  isConnected.value = val
})

watch(() => props.isConnecting, (val) => {
  isConnecting.value = val
})

// 监听自动滚动开关的变化
watch(isAutoScroll, (newVal) => {
  if (newVal && !isInternalChange) {
    // 用户打开自动滚动，执行滚动到底部
    scrollToEnd()
  }
  // 如果是由按钮点击触发的变化，重置标记
  if (isInternalChange) {
    isInternalChange = false
  }
})

const initEditor = async () => {
  if (!editorContainer.value) return

  const uniqueUri = monaco.Uri.parse(`${props.sessionIdPrefix}:///output-${props.connection.sessionId}.txt`)
  editorModel = monaco.editor.createModel(
    `${props.initMessage}\n`,
    'plaintext',
    uniqueUri
  )

  editor = monaco.editor.create(editorContainer.value, {
    model: editorModel,
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    theme: 'vs-dark',
    automaticLayout: true,
    hover: { enabled: false },
    occurrencesHighlight: 'off',
    selectionHighlight: false,
    codeLens: false,
    links: false,
    wordWrap: 'off',
    wrappingStrategy: 'simple'
  })

  editor.layout()
  editor.updateOptions({ readOnly: true })

  editor.onMouseDown(() => {
    isAutoScroll.value = false
  })
}

const appendToTerminal = (content: string) => {
  if (!editorModel) return

  // 如果不显示日志，直接返回
  if (!isShowLog.value) return

  const lastLine = editorModel.getLineCount()
  let lastCol = 1
  if (lastLine > 0) {
    const lineContent = editorModel.getLineContent(lastLine)
    lastCol = (lineContent ? lineContent.length : 0) + 1
  }

  try {
    editorModel.pushEditOperations(
      [],
      [
        {
          range: new monaco.Range(lastLine, lastCol, lastLine, lastCol),
          text: content,
          forceMoveMarkers: true
        }
      ],
      () => null
    )
  } catch (err) {
    console.error('appendToTerminal error:', err)
    return
  }

  if (isAutoScroll.value) {
    scrollToEnd()
  }

  totalRecvSize += content.length
  if (totalRecvSize > MAX_CLEAR_INTERVAL_SIZE) {
    clearTerminal()
  }
}

const scrollToEnd = () => {
  if (!editorModel) return
  const newLastLine = editorModel.getLineCount()
  editor?.revealLine(newLastLine)
}

const scrollToStart = () => {
  editor?.revealLine(1)
}

// 点击滚动到底部按钮：滚动到底部，然后取消自动滚动
const handleScrollToBottom = () => {
  scrollToEnd()
  isInternalChange = true
  isAutoScroll.value = false
}

// 点击滚动到顶部按钮：滚动到顶部，然后取消自动滚动
const handleScrollToTop = () => {
  scrollToStart()
  isInternalChange = true
  isAutoScroll.value = false
}

const clearTerminal = () => {
  if (editorModel) {
    editorModel.setValue('')
  }
  totalRecvSize = 0
}

const handleCommandSent = (cmdName: string) => emit('onCommandSent', cmdName)

const handleSendCommand = () => {
  const cmd = currentCommand.value
  if (!cmd.trim()) return

  let sendData = cmd

  // 处理HEX模式
  if (hexMode.value) {
    sendData = parseHexString(cmd)
    if (sendData === null) {
      return // 无效的HEX格式
    }
  }

  // 处理回车换行
  if (autoNewline.value) {
    sendData = sendData + '\r\n'
  }

  emit('onSend', sendData)
  currentCommand.value = ''
}

// 解析HEX字符串为二进制
const parseHexString = (hex: string): string | null => {
  try {
    // 移除空格和换行
    const cleaned = hex.replace(/[\s\n\r]+/g, '')
    // 验证是否为有效的HEX字符串
    if (!/^[0-9A-Fa-f]*$/.test(cleaned) || cleaned.length % 2 !== 0) {
      console.error('无效的HEX格式')
      return null
    }
    // 转换为二进制字符串
    let result = ''
    for (let i = 0; i < cleaned.length; i += 2) {
      result += String.fromCharCode(parseInt(cleaned.substr(i, 2), 16))
    }
    return result
  } catch (error) {
    console.error('HEX解析错误:', error)
    return null
  }
}

const appendCommandToTerminal = (content: string) => {
  appendToTerminal(`\n[TX] ${content}\n`)
  totalTxSize += content.length
  txBytes.value = formatBytes(totalTxSize)
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const updateRxBytes = (len: number) => {
  totalRecvSize += len
  rxBytes.value = formatBytes(totalRecvSize)
}

const updateTxBytes = (len: number) => {
  totalTxSize += len
  txBytes.value = formatBytes(totalTxSize)
}

const resetRxTx = () => {
  totalRecvSize = 0
  totalTxSize = 0
  rxBytes.value = '0 B'
  txBytes.value = '0 B'
}

const setConnected = (val: boolean) => {
  isConnected.value = val
  emit('update:isConnected', val)
}

const setConnecting = (val: boolean) => {
  isConnecting.value = val
}

const focusInput = () => {
  commandInput.value?.focus()
}

const getEditorContent = (): string => {
  return editorModel?.getValue() || ''
}

// 暴露给父组件的方法
defineExpose({
  appendToTerminal,
  updateRxBytes,
  updateTxBytes,
  resetRxTx,
  clearTerminal,
  scrollToEnd,
  scrollToStart,
  setConnected,
  setConnecting,
  focusInput,
  getEditorContent,
  editor,
  refreshGroupsCmds: () => presetCommandsRef.value?.refreshGroupsCmds?.(),
  isShowLog
})

onMounted(() => {
  initEditor()
})

onUnmounted(() => {
  if (editorModel) {
    editorModel.dispose()
    editorModel = null
  }

  if (editor) {
    editor.dispose()
    editor = null
  }
})
</script>

<style scoped>
.unified-terminal {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #fff;
  font-family: 'Fira Code', 'Consolas', monospace;
  overflow: hidden;
}

.terminal-output {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
  white-space: pre-wrap;
  line-height: 1.5;
  background-color: #1e1e1e;
  position: relative;
  border: 1px solid transparent;
  transition: border-color 0.2s;
}

.terminal-output:focus-within {
  border-color: #007fd4;
}

.preset-commands-row {
  padding: 8px 12px;
  background-color: #252526;
  border-bottom: 1px solid #333;
}

.terminal-input {
  display: flex;
  align-items: center;
  background-color: #333;
  margin: 8px 8px 8px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  height: 38px;
  transition: border-color 0.2s;
}

.terminal-input:focus-within {
  border-color: #007fd4;
}

.prompt {
  color: #cccccc;
  font-weight: bold;
  white-space: nowrap;
  margin-left: 10px;
  user-select: none;
}

.command-input {
  flex: 1;
  background: transparent;
  border: none;
  color: #fff;
  outline: none;
  font-family: monospace;
  font-size: 14px;
  padding: 0 8px;
}

.command-input::placeholder {
  color: #666;
}

.command-input:disabled,
.command-input.not-connected {
  opacity: 0.7;
  cursor: not-allowed;
}

.input-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-right: 8px;
  margin-left: 8px;
}

.terminal-switch {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-right: 8px;
  margin-left: 8px;
}

.terminal-switch :deep(.el-switch) {
  font-size: 11px;
}

.terminal-switch :deep(.el-switch__core) {
  height: 20px;
  background-color: #131315 !important;
  border-color: transparent !important;
}

.terminal-switch :deep(.el-switch__core:hover) {
  background-color: #2A2A2C !important;
}

.terminal-switch :deep(.el-switch.is-checked .el-switch__core) {
  background-color: #2E5CC7 !important;
}

.terminal-switch :deep(.el-switch.is-checked .el-switch__core:hover) {
  background-color: #2E5CC7 !important;
}

.input-controls :deep(.el-switch__label) {
  font-size: 11px;
}

.send-btn {
  margin-right: 10px;
  background-color: #165dff !important;
  border-color: #3370ff !important;
  color: white !important;
}

.command-input.hex-mode {
  font-family: monospace;
  letter-spacing: 1px;
}

.send-btn:hover:not(:disabled) {
  background-color: #4080ff !important;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.scroll-wrapper {
  position: absolute;
  right: 40px;
  bottom: 10px;
  z-index: 10;
  width: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.scroll-btn {
  width: 32px !important;
  height: 32px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background-color: rgba(50, 50, 51, 0.8) !important;
  border-color: #555 !important;
  color: #fff !important;
  margin: 0 !important;
  padding: 0 !important;
  transition: all 0.2s ease;
}

.scroll-btn:hover {
  background-color: rgba(70, 70, 72, 0.9) !important;
  transform: scale(1.05);
}

.terminal-output::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.terminal-output::-webkit-scrollbar-track {
  background: #2d2d2d;
}

.terminal-output::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 4px;
}

.terminal-output::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
