<template>
  <div class="telnet-terminal">
    <div class="terminal-header">
      <span class="connection-info">
        {{ connection.host }}:{{ connection.port }}({{ connection.name || connection.id }})
        <span class="connection-status" :class="isConnected ? 'connected' : 'disconnected'">
          {{ isConnected ? '已连接' : '已断开' }}
        </span>
      </span>
      <div class="header-buttons">
        <el-checkbox v-model="isShowLog" class="show-log-checkbox" size="small">
          显示日志
        </el-checkbox>
        <el-checkbox v-model="isAutoScroll" class="auto-scroll-checkbox" size="small">
          自动滚动
        </el-checkbox>
        <el-button
          type="default"
          icon="Delete"
          size="small"
          class="clear-btn"
          @click="clearTerminal"
          :disabled="output === ''"
        >
          清空屏幕
        </el-button>

        <el-button type="default" icon="Document" size="small" class="log-btn" @click="openLogFile">
          打开日志
        </el-button>

        <el-button type="danger" icon="Close" size="small" class="close-btn" @click="handleClose">
          关闭连接
        </el-button>
      </div>
    </div>

    <!-- 终端输出区域 -->
    <div ref="editorContainer" class="terminal-output"></div>
    <PresetCommands
      :is-connected="isConnected"
      :connection="connection"
      @commandSent="handleCommandSent"
      @commandSentContent="appendCommandToTerminal"
    />

    <!-- 命令输入区域 -->
    <div class="terminal-input">
      <span class="prompt">></span>
      <input
        v-model="currentCommand"
        @keydown.enter="sendCommand"
        placeholder="输入命令并按回车..."
        ref="commandInput"
        :disabled="!isConnected"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import * as monaco from 'monaco-editor'
import PresetCommands from './PresetCommands.vue'
import TelnetInfo from '../entity/protocol/TelnetInfo'
const MAX_RETRY_COUNT = 1000
const RETRY_INTERVAL_MS = 3000
const MAX_CLEAR_INTERVAL_SIZE = 1024 * 1024 * 1

const emit = defineEmits(['onClose', 'commandSent'])
const props = defineProps<{
  connection: { id: number; host: string; port: number; name?: string }
  onClose?: () => void
}>()

const currentCommand = ref('')
const commandInput = ref<HTMLInputElement>(null)
const isConnected = ref(true)
let removeDataListener: (() => void) | null = null
let removeCloseListener: (() => void) | null = null
let currentConnId = 0
const isShowLog = ref(true)
const isAutoScroll = ref(true)
const editorContainer = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let editorModel: monaco.editor.ITextModel | null = null // 直接持有模型，不通过 Vue 响应式

let retryCount = 0
let retryTimer: NodeJS.Timeout | null = null
let stopRetry = ref(false)
let totalRecvSize = 0

const initEditor = async () => {
  if (!editorContainer.value) return

  editorModel = monaco.editor.createModel(
    `try to connect ${props.connection.host}:${props.connection.port}...\n`,
    'plaintext',
    monaco.Uri.parse('telnet-terminal:///output.txt')
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
    links: false
  })

  editor.updateOptions({ readOnly: true })
}

const appendToTerminal = (content: string) => {
  if (!editorModel) return

  const lastLine = editorModel.getLineCount()
  const lastCol = editorModel.getLineContent(lastLine).length + 1

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

  if (isAutoScroll.value) {
    const newLastLine = editorModel!.getLineCount()
    editor?.revealLine(newLastLine)
  }

  totalRecvSize += content.length
  if (totalRecvSize > MAX_CLEAR_INTERVAL_SIZE) {
    clearTerminal()
  }
}

const openLogFile = async () => {
  try {
    const result = await window.telnetApi.openTelnetLog(TelnetInfo.buildWithValue(props.connection))
    if (!result.success) {
      ElMessage.error(`打开日志失败：${result.message}`)
    }
  } catch (error) {
    ElMessage.error('打开日志失败：' + (error instanceof Error ? error.message : '未知错误'))
  }
}

const handleClose = async () => {
  stopRetry.value = true
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }

  if (currentConnId) {
    try {
      await window.telnetApi.telnetDisconnect(currentConnId)
      isConnected.value = false
      emit('onClose')
      if (typeof props.onClose === 'function') {
        props.onClose()
      }
    } catch (error) {
      console.error('关闭连接失败:', error)
      ElMessage.error('关闭连接失败')
    } finally {
      if (removeDataListener) {
        removeDataListener()
        removeDataListener = null
      }
      if (removeCloseListener) {
        removeCloseListener()
        removeCloseListener = null
      }
      isConnected.value = false
      currentConnId = 0
    }
  } else {
    emit('onClose')
    if (typeof props.onClose === 'function') {
      props.onClose()
    }
  }
}

const handleTelnetClose = (connId: number) => {
  if (connId === currentConnId) {
    ElMessage.info('连接已关闭，将尝试重新连接...')
    isConnected.value = false
    currentConnId = 0
    appendToTerminal(`连接已关闭，将在${RETRY_INTERVAL_MS / 1000}秒后尝试重连...\n`)
    if (!stopRetry.value) {
      setTimeout(connect, 1000)
    }
  }
}

const connect = async () => {
  stopRetry.value = false
  retryCount = 0
  isConnected.value = false
  currentConnId = 0

  let isFirstConnect = true
  const attemptConnect = async () => {
    if (stopRetry.value) {
      console.log(`\n已手动停止重连，终止尝试\n`)
      return
    }

    try {
      const result = await window.telnetApi.connectTelnet(
        TelnetInfo.buildWithValue(props.connection)
      )
      if (result.success) {
        if (removeDataListener) {
          removeDataListener()
          removeDataListener = null
        }
        if (removeCloseListener) {
          removeCloseListener()
          removeCloseListener = null
        }

        currentConnId = result.connId
        isConnected.value = true

        removeDataListener = window.telnetApi.onTelnetData((data) => {
          if (data.connId !== currentConnId) return

          if (isShowLog.value) {
            let formattedData = data.data
              .replace(/\r\n/g, '\n')
              .replace(/\r/g, '\n')
              .replace(/\0/g, '')

            // 3. 过滤重复的服务端初始化信息（根据实际初始化信息特征调整正则）
            // 例如服务端初始化信息以"Server initialized"开头
            const isInitMessage = /^Server initialized/.test(formattedData.trim())

            if (isInitMessage) {
              if (isFirstConnect) {
                appendToTerminal(formattedData)
                isFirstConnect = false
              }
            } else {
              appendToTerminal(formattedData)
            }
          }
        })

        removeCloseListener = window.telnetApi.onTelnetClose(handleTelnetClose)
        commandInput.value?.focus()
        appendToTerminal(`connect success, retry count: ${retryCount + 1}\n`)
        retryCount = 0
        isFirstConnect = false
      } else {
        throw new Error(result.message || '连接失败')
      }
    } catch (error) {
      retryCount++
      const errMsg = (error as Error).message
      appendToTerminal(`connect failed: (${retryCount}/${MAX_RETRY_COUNT})：${errMsg}\n`)

      if (retryCount < MAX_RETRY_COUNT && !stopRetry.value) {
        retryTimer = setTimeout(attemptConnect, RETRY_INTERVAL_MS)
      } else if (retryCount >= MAX_RETRY_COUNT) {
        appendToTerminal(`reach max retry count: (${MAX_RETRY_COUNT}\n`)
        emit('onClose')
        if (typeof props.onClose === 'function') props.onClose()
      }
    }
  }

  await attemptConnect()
}

const sendCommand = async () => {
  if (!currentCommand.value.trim() || !isConnected.value) return

  let sendData = currentCommand.value
  currentCommand.value = ''
  commandInput.value?.focus()
  appendToTerminal(`[${new Date().toISOString()}] SEND >>>>>>>>>> ${sendData}\n`)

  try {
    await window.telnetApi.telnetSend({
      conn: TelnetInfo.buildWithValue(props.connection),
      command: sendData.trim()
    })
  } catch (error) {
    ElMessage.error('命令发送失败')
    console.error('发送失败:', error)
  }
}

const clearTerminal = () => {
  if (editorModel) {
    editorModel.setValue('')
  }
  commandInput.value?.focus()
  totalRecvSize = 0
}

const handleCommandSent = (cmdName: string) => emit('commandSent', cmdName)

const appendCommandToTerminal = (content: string) => {
  appendToTerminal(`[${new Date().toISOString()}] SEND >>>>>>>>>> ${content}\n`)
  commandInput.value?.focus()
}

onMounted(() => {
  initEditor()
  connect()
})

// 组件卸载清理
onUnmounted(() => {
  stopRetry.value = true
  if (retryTimer) {
    clearTimeout(retryTimer)
  }

  if (editorModel) {
    editorModel.dispose()
    editorModel = null
  }

  if (editor) {
    editor.dispose()
    editor = null
  }

  if (removeDataListener) {
    removeDataListener()
    removeDataListener = null
  }
  if (removeCloseListener) {
    removeCloseListener()
    removeCloseListener = null
  }

  if (currentConnId && isConnected.value) {
    window.telnetApi.telnetDisconnect(currentConnId).catch((err) => {
      console.error('卸载时断开失败:', err)
    })
  }
})
</script>

<style scoped>
.telnet-terminal {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #fff;
  font-family: 'Fira Code', 'Consolas', monospace;
  border-radius: 0px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #333;
  background: #2d2d2d;
  height: 42px;
  box-sizing: border-box;
}

.connection-info {
  font-size: 14px;
  color: #e0e0e0;
  flex: 1;
  padding: 0 10px;
}

.connection-status {
  margin-left: 10px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: normal;
}

.connection-status.connected {
  background-color: rgba(24, 193, 56, 0.2);
  color: #18c138;
}

.connection-status.disconnected {
  background-color: rgba(255, 95, 88, 0.2);
  color: #ff5f58;
}

.header-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-right: 10px;
}

.log-btn,
.close-btn,
.clear-btn,
.add-preset-btn {
  padding: 6px 12px !important;
  border-radius: 4px !important;
  transition: all 0.2s ease !important;
}

.log-btn,
.clear-btn {
  background-color: #3a3a3a !important;
  border-color: #444 !important;
  color: #e0e0e0 !important;
}

.log-btn:hover,
.clear-btn:hover {
  background-color: #4a4a4a !important;
  border-color: #555 !important;
  transform: translateY(-1px);
}

.close-btn {
  background-color: #ff4d4f !important;
  border-color: #ff6767 !important;
  color: white !important;
}

.close-btn:hover {
  background-color: #ff6b6b !important;
  border-color: #ff8080 !important;
  transform: translateY(-1px);
}

.terminal-output {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
  white-space: pre-wrap;
  line-height: 1.5;
  background-color: #1e1e1e;
  position: relative;
}

.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #888;
}

.empty-state .hint {
  font-size: 12px;
  margin-top: 8px;
  color: #666;
}

.terminal-input input {
  flex: 1;
  background: transparent;
  border: none;
  color: #e0e0e0;
  padding: 8px 0;
  outline: none;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 14px;
}

.terminal-input input::placeholder {
  color: #666;
}

.terminal-input input:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.terminal-input {
  display: flex;
  align-items: center;
  border-radius: 0px;
}

.terminal-input {
  display: flex;
  align-items: center;
  background-color: #333;
}

.prompt {
  color: #cccccc;
  font-weight: bold;
  white-space: nowrap;
  margin-left: 10px;
  user-select: none;
}

.terminal-input input {
  flex: 1;
  background: #333;
  border: none;
  color: #fff;
  padding: 8px 10px;
  outline: none;
  font-family: monospace;
}

.auto-scroll-checkbox,
.show-log-checkbox {
  color: #e0e0e0 !important;
  margin-right: 8px !important;
  align-self: center !important;
}

.el-checkbox__inner {
  background-color: #3a3a3a !important;
  border-color: #444 !important;
}

.el-checkbox__input.is-checked .el-checkbox__inner {
  background-color: #165dff !important;
  border-color: #165dff !important;
}

.el-checkbox__label {
  color: #e0e0e0 !important;
  font-size: 14px !important;
}

.context-menu-container {
  position: fixed !important;
  z-index: 9999 !important;
  padding: 2px !important;
  background-color: #2d2d2d !important;
  border-radius: 4px !important;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5) !important;
  border: 1px solid #444 !important;
  transition: opacity 0.1s ease;
}

.context-menu {
  width: 120px !important;
  background-color: transparent !important;
  border: none !important;
}

.menu-item {
  color: #e0e0e0 !important;
  height: 36px !important;
  line-height: 36px !important;
  padding: 0 16px !important;
  margin: 0 !important;
  border-radius: 2px !important;
  transition: background-color 0.15s ease !important;
}

.menu-item:hover {
  background-color: #3a3a3a !important;
}

.delete-item {
  color: #ff4d4f !important;
}

.el-menu--vertical {
  border-right: none !important;
}

.el-menu-item:not(:last-child) {
  border-bottom: 1px solid #383838 !important;
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

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.el-button,
.el-checkbox {
  animation: fadeIn 0.2s ease-out;
}

.el-dialog {
  background: #2d2d2d !important;
  border-radius: 8px !important;
}

.el-dialog__title {
  color: #fff !important;
  font-size: 18px !important;
}

.el-form-item__label {
  color: #ccc !important;
  width: 100px;
}

.el-input,
.el-select {
  --el-input-bg-color: #cccccc !important;
  --el-input-text-color: #000 !important;
  --el-input-placeholder-color: #888 !important;
  --el-border-color: #444 !important;
}

.el-input:focus-within,
.el-select:focus-within {
  --el-border-color: #42b983 !important;
}

.custom-textarea,
.el-textarea__inner {
  background-color: transparent;
  max-height: 200px;
}
</style>
