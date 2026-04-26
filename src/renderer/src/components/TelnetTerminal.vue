<template>
  <div class="telnet-terminal">
    <!-- 终端输出区域 -->
    <div ref="editorContainer" class="terminal-output"></div>
    <div class="scroll-wrapper">
      <el-button
        icon="ArrowUp"
        size="mini"
        circle
        @click="scrollToStart"
        class="scroll-btn up-btn"
      />
      <el-button
        icon="ArrowDown"
        size="mini"
        circle
        @click="scrollToEnd"
        class="scroll-btn down-btn"
      />
    </div>

    <div class="terminal-header">
      <div class="header-left">
        <span class="connection-status" :class="isConnected ? 'connected' : 'disconnected'">
          {{ isConnected ? '已连接' : '已断开' }}
        </span>
        <el-button
          v-if="isConnected"
          type="danger"
          icon="Close"
          size="small"
          class="close-btn"
          @click="handleClose"
        >
          断开
        </el-button>
        <el-button
          v-else
          type="primary"
          icon="Refresh"
          size="small"
          class="reconnect-btn toggle-btn"
          @click="handleReconnect"
          :disabled="isConnecting"
        >
          {{ isConnecting ? '连接中...' : '重连' }}
        </el-button>
        <el-button
          type="default"
          icon="Delete"
          size="small"
          class="clear-btn"
          @click="clearTerminal"
        >
          清空屏幕
        </el-button>
        <el-button type="default" icon="Document" size="small" class="log-btn" @click="openLogFile">
          打开日志
        </el-button>
        <el-button type="default" icon="DocumentAdd" size="small" class="log-btn" @click="saveLogFile">
          日志另存为
        </el-button>
        <el-switch
          v-model="isAutoScroll"
          @change="autoScrollChange"
          size="small"
          active-text="自动滚动"
        />
        <el-switch v-model="isShowLog" size="small" active-text="显示日志" />
      </div>
      <div class="rx-tx-info">
        <span class="rx">RX: {{ rxBytes }}</span>
        <span class="tx">TX: {{ txBytes }}</span>
      </div>
    </div>

    <PresetCommands
      :is-connected="isConnected"
      :connection="connection"
      ref="presetCommandsRef"
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
      <el-button
        type="primary"
        icon="Promotion"
        size="small"
        class="send-btn"
        @click="sendCommand"
        :disabled="!isConnected"
      >
        发送
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import * as monaco from 'monaco-editor'
import PresetCommands from './PresetCommands.vue'
import TelnetInfo from '../entity/protocol/TelnetInfo'
import FileUtils from '../utils/FileUtils'
const MAX_RETRY_COUNT = 1000
const RETRY_INTERVAL_MS = 3000
const MAX_CLEAR_INTERVAL_SIZE = 1024 * 1024 * 30

const emit = defineEmits(['onClose', 'commandSent'])
const props = defineProps<{
  connection: {
    id: number
    connectionType: string
    host: string
    port: number
    name?: string
    sessionId: string
  }
  onClose?: () => void
}>()

const currentCommand = ref('')
const rxBytes = ref('0 B')
const txBytes = ref('0 B')
const commandInput = ref<HTMLInputElement | null>(null)
const isConnected = ref(true)
const isConnecting = ref(false)
let removeDataListener: (() => void) | null = null
let removeCloseListener: (() => void) | null = null
let currentConnId = 0
const isShowLog = ref(true)
const isAutoScroll = ref(true)
const editorContainer = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let editorModel: monaco.editor.ITextModel | null = null // 直接持有模型，不通过 Vue 响应式
let wrapLineAction: monaco.IDisposable | null = null
let isWordWrapEnabled = false

let retryCount = 0
let retryTimer: NodeJS.Timeout | null = null
let stopRetry = ref(false)
let totalRecvSize = 0 //当前显示的总大小
let allRecvSize = 0 //实际总大小
let totalTxSize = 0

const presetCommandsRef = ref<InstanceType<typeof PresetCommands>>()

// 暴露给父组件的连接状态（使用 computed 获取值而不是 ref 对象）
const isConnectedValue = computed(() => isConnected.value)

const initEditor = async () => {
  if (!editorContainer.value) return

  const uniqueUri = monaco.Uri.parse(`telnet-terminal:///output-${props.connection.sessionId}.txt`)
  editorModel = monaco.editor.createModel(
    `try to connect ${props.connection.host}:${props.connection.port}\n`,
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

  handleMouseWheel(editor)

  // 注册原生右键菜单扩展
  registerWrapLineContextMenu()
}

const registerWrapLineContextMenu = () => {
  if (!editor) return
  if (wrapLineAction) {
    wrapLineAction.dispose()
    wrapLineAction = null
  }

  wrapLineAction = editor.addAction({
    id: 'toggle-word-wrap',
    label: isWordWrapEnabled ? '✓ 自动换行' : ' 自动换行',
    keybindings: [],
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.5,
    run: () => {
      if (!editor) return
      isWordWrapEnabled = !isWordWrapEnabled
      editor.updateOptions({
        wrappingStrategy: isWordWrapEnabled ? 'advanced' : 'simple',
        wordWrap: isWordWrapEnabled ? 'on' : 'off'
      })
      registerWrapLineContextMenu()
    }
  })
}

const handleMouseWheel = (editor) => {
  let fontSize = 14
  editorContainer.value?.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey && e.deltaY !== 0) {
        e.preventDefault() // 阻止页面滚动
        if (e.deltaY < 0) {
          fontSize = Math.min(fontSize + 2, 30)
        } else {
          fontSize = Math.max(fontSize - 2, 5)
        }
        editor.updateOptions({
          fontSize: fontSize
        })
      }
    },
    { passive: false, capture: true }
  )
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
  if (isAutoScroll.value) scrollToEnd()

  totalRecvSize += content.length
  if (totalRecvSize > MAX_CLEAR_INTERVAL_SIZE) {
    clearTerminal()
  }
}

const scrollToEnd = () => {
  const newLastLine = editorModel!.getLineCount()
  editor?.revealLine(newLastLine)
}

const scrollToStart = () => {
  editor?.revealLine(0)
}

const openLogFile = async () => {
  try {
    const result = await window.connectApi.openConnectLog(props.connection.sessionId)
    if (!result.success) {
      ElMessage.error(`打开日志失败：${result.message}`)
    }
  } catch (error) {
    ElMessage.error('打开日志失败：' + (error instanceof Error ? error.message : '未知错误'))
  }
}

const saveLogFile = async () => {
  if (!editorModel) return
  const content = editorModel.getValue()
  try {
    const result = await window.dialogApi.saveFileDialog({
      title: '保存日志',
      defaultPath: `telnet_${props.connection.host}_${props.connection.port}_${Date.now()}.log`,
      filters: [{ name: '日志文件', extensions: ['log', 'txt'] }]
    })
    if (result.filePath) {
      const writeResult = await window.toolApi.writeFile({
        path: result.filePath,
        content: content
      })
      if (writeResult.success) {
        ElMessage.success('日志保存成功')
        window.toolApi.showItemInFolder(result.filePath)
      } else {
        ElMessage.error('保存失败：' + writeResult.message)
      }
    }
  } catch (error) {
    ElMessage.error('保存失败：' + (error instanceof Error ? error.message : '未知错误'))
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
      await window.connectApi.stopConnect({
        ...TelnetInfo.buildWithValue(props.connection),
        sessionId: props.connection.sessionId
      })
      isConnected.value = false
      appendToTerminal(`\n连接已手动关闭\n`)
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
      rxBytes.value = '0 B'
      allRecvSize = 0
      txBytes.value = '0 B'
      totalTxSize = 0
    }
  } else {
    isConnected.value = false
    appendToTerminal(`\n连接已关闭\n`)
  }
}

const handleReconnect = () => {
  appendToTerminal(`\n正在重新连接...\n`)
  connect()
}

const handleTelnetClose = (connId: number) => {
  if (connId === currentConnId) {
    ElMessage.info('连接已关闭，将尝试重新连接...')
    isConnected.value = false
    currentConnId = 0
    rxBytes.value = '0 B'
    allRecvSize = 0
    txBytes.value = '0 B'
    totalTxSize = 0
    appendToTerminal(`\n连接已关闭，将在${RETRY_INTERVAL_MS / 1000}秒后尝试重连...\n`)
    if (!stopRetry.value) {
      setTimeout(connect, 1000)
    }
  }
}

const connect = async () => {
  stopRetry.value = false
  retryCount = 0
  isConnected.value = false
  isConnecting.value = true
  currentConnId = 0
  rxBytes.value = '0 B'
  allRecvSize = 0
  txBytes.value = '0 B'
  totalTxSize = 0

  let isFirstConnect = true
  const attemptConnect = async () => {
    if (stopRetry.value) {
      console.log(`\n已手动停止重连，终止尝试\n`)
      isConnecting.value = false
      return
    }

    try {
      const result = await window.connectApi.startConnect({
        ...TelnetInfo.buildWithValue(props.connection),
        sessionId: props.connection.sessionId
      })
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
        isConnecting.value = false

        removeDataListener = window.connectApi.onRecvData((data) => {
          if (data.connId !== currentConnId) return
          calcRecvSize(data.data.length)
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
                appendToTerminal(`\n${formattedData}`)
                isFirstConnect = false
              }
            } else {
              appendToTerminal(`\n${formattedData}`)
            }
          }
        })

        removeCloseListener = window.connectApi.onConnectClose(handleTelnetClose)
        commandInput.value?.focus()
        appendToTerminal(`\nconnect success, retry count: ${retryCount + 1}\n`)
        retryCount = 0
        isFirstConnect = false
      } else {
        throw new Error(result.message || '连接失败')
      }
    } catch (error) {
      retryCount++
      const errMsg = (error as Error).message
      appendToTerminal(`\nconnect failed: (${retryCount}/${MAX_RETRY_COUNT}): ${errMsg}\n`)

      if (retryCount < MAX_RETRY_COUNT && !stopRetry.value) {
        retryTimer = setTimeout(attemptConnect, RETRY_INTERVAL_MS)
      } else if (retryCount >= MAX_RETRY_COUNT) {
        appendToTerminal(`\nreach max retry count: (${MAX_RETRY_COUNT}\n`)
        isConnecting.value = false
        emit('onClose')
        if (typeof props.onClose === 'function') props.onClose()
      }
    }
  }

  await attemptConnect()
}

const calcRecvSize = (len: number): void => {
  allRecvSize += len
  rxBytes.value = FileUtils.formatBytes(allRecvSize)
}

const calcTxSize = (len: number): void => {
  totalTxSize += len
  txBytes.value = FileUtils.formatBytes(totalTxSize)
}

const sendCommand = async () => {
  if (!currentCommand.value.trim() || !isConnected.value) return

  let sendData = currentCommand.value
  currentCommand.value = ''
  commandInput.value?.focus()
  appendToTerminal(`\n[${new Date().toISOString()}] SEND >>>>>>>>>> ${sendData}\n`)
  calcTxSize(sendData.length)

  try {
    await window.connectApi.sendData({
      conn: {
        ...TelnetInfo.buildWithValue(props.connection),
        sessionId: props.connection.sessionId
      },
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
  appendToTerminal(`\n[${new Date().toISOString()}] SEND >>>>>>>>>> ${content}\n`)
  commandInput.value?.focus()
}

const refreshGroupsCmds = () => presetCommandsRef.value?.refreshGroupsCmds?.()

const autoScrollChange = (autoScroll) => {
  if (autoScroll) {
    scrollToEnd()
  }
}

const handleFontChange = (font) => {
  editor?.updateOptions({ fontFamily: font })
  editor?.layout()
}

const handleFontSizeChange = (action) => {
  if (editor) {
    const currentSize = editor.getOption(monaco.editor.EditorOption.fontSize)
    let newSize = currentSize
    if (action === 'increase') {
      newSize = Math.min(currentSize + 2, 30)
    } else {
      newSize = Math.max(currentSize - 2, 8)
    }

    editor.updateOptions({
      fontSize: newSize
    })
  }
}

const refreshLayout = () => {
  editor?.layout()
}

defineExpose({
  refreshGroupsCmds,
  handleFontChange,
  handleFontSizeChange,
  refreshLayout,
  isConnected: isConnectedValue
})

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

  if (wrapLineAction) {
    wrapLineAction.dispose()
    wrapLineAction = null
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
    window.connectApi
      .stopConnect({
        ...TelnetInfo.buildWithValue(props.connection),
        sessionId: props.connection.sessionId
      })
      .catch((err) => {
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
  padding: 8px 12px;
  border-bottom: 1px solid #333;
  background-color: #1e1e1e;
  box-sizing: border-box;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  flex: 1;
}

.rx-tx-info {
  display: flex;
  gap: 12px;
  font-size: 12px;
  margin-left: auto;
}

.rx-tx-info .rx {
  color: #4ade80;
}

.rx-tx-info .tx {
  color: #60a5fa;
}

.connection-status {
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

.close-btn,
.clear-btn,
.add-preset-btn {
  width: 90px !important;
  padding: 6px 12px !important;
  border-radius: 4px !important;
  transition: all 0.2s ease !important;
}

.log-btn {
  background-color: #1A97ED !important;
  border-color: #4db3f7 !important;
  color: white !important;
  width: 90px !important;
  padding: 6px 12px !important;
  border-radius: 4px !important;
  transition: all 0.2s ease !important;
  margin-left: 0 !important;
}

.log-btn:hover {
  filter: brightness(0.85);
  transform: translateY(-1px);
}

.clear-btn {
  background-color: #F56C6C !important;
  border-color: #f78989 !important;
  color: white !important;
  margin-left: 0 !important;
}

.clear-btn:hover {
  filter: brightness(0.85);
  transform: translateY(-1px);
}

.close-btn,
.reconnect-btn {
  width: 90px !important;
  padding: 6px 12px !important;
}

.close-btn {
  background-color: #FF0000 !important;
  border-color: #ff3333 !important;
  color: white !important;
}

.close-btn:hover {
  filter: brightness(0.85);
  transform: translateY(-1px);
}

.reconnect-btn {
  background-color: #165dff !important;
  border-color: #3370ff !important;
  color: white !important;
}

.reconnect-btn:hover {
  background-color: #4080ff !important;
  border-color: #5599ff !important;
  transform: translateY(-1px);
}

.reconnect-btn:disabled {
  background-color: #555 !important;
  border-color: #666 !important;
  color: #999 !important;
  cursor: not-allowed !important;
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
  background-color: #333;
  margin-bottom: 8px;
  margin-right: 8px;
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

.terminal-input input {
  flex: 1;
  background: transparent;
  border: none;
  color: #fff;
  outline: none;
  font-family: monospace;
}

.send-btn {
  margin-right: 8px;
  background-color: #165dff !important;
  border-color: #3370ff !important;
  color: white !important;
}

.send-btn:hover:not(:disabled) {
  background-color: #4080ff !important;
  border-color: #5599ff !important;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  background: #252526 !important;
  border-radius: 8px !important;
}

.el-dialog__title {
  color: #f0f0f0 !important;
  font-size: 18px !important;
}

.el-form-item__label {
  color: #e8e8e8 !important;
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

.switch-item {
  color: #e0e0e0;
  font-size: 14px;
  display: flex;
  align-items: center;
}

:deep(.el-switch) {
  --el-switch-on-color: #165dff;
  --el-switch-off-color: #444;
}

:deep(.el-switch__label) {
  color: #e0e0e0;
}

.scroll-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(50, 50, 51, 0.5);
  border-color: #555;
  color: #fff;
  transition: all 0.2s ease;

  position: static !important;
}

.scroll-btn:hover {
  background-color: rgba(60, 60, 62, 0.9);
  transform: scale(1.05);
}

.scroll-wrapper {
  position: absolute;
  right: 40px;
  bottom: 150px;
  z-index: 10;

  width: 32px;

  margin: 0;
  padding: 0;
  border: none;

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
  position: static !important;

  transition: all 0.2s ease;
}
</style>
