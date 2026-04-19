<template>
  <div class="com-terminal">
    <!-- 第1行：富文本显示区域 -->
    <div ref="editorContainer" class="terminal-output"></div>

    <!-- 滚动按钮 -->
    <div class="scroll-wrapper">
      <el-button icon="ArrowUp" size="mini" circle @click="scrollToStart" class="scroll-btn up-btn" />
      <el-button icon="ArrowDown" size="mini" circle @click="scrollToEnd" class="scroll-btn down-btn" />
    </div>

    <!-- 第2行：基础操作按钮 -->
    <div class="toolbar-row">
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
        icon="Link"
        size="small"
        class="connect-btn"
        @click="handleConnect"
        :disabled="isConnecting"
      >
        {{ isConnecting ? '连接中...' : '连接' }}
      </el-button>

      <el-button icon="Delete" size="small" class="tool-btn" @click="clearTerminal" :disabled="output === ''">
        清屏
      </el-button>

      <el-button icon="SetUp" size="small" class="tool-btn" @click="togglePin">
        {{ isPinned ? '取消固定' : '固定显示' }}
      </el-button>

      <el-button icon="FolderOpened" size="small" class="tool-btn" @click="openLogFolder">
        打开日志
      </el-button>

      <el-button icon="Document" size="small" class="tool-btn" @click="openLogFile">
        打开文件
      </el-button>

      <el-checkbox v-model="showTimestamp" size="small" class="tool-checkbox">时间戳</el-checkbox>

      <el-switch v-model="isHexMode" size="small" active-text="HEX" inactive-text="字符串" class="tool-switch" />

      <el-button icon="Download" size="small" class="tool-btn" @click="saveLog">另存为</el-button>

      <div class="rx-tx-info">
        <span class="rx">RX: {{ rxBytes }}</span>
        <span class="tx">TX: {{ txBytes }}</span>
      </div>
    </div>

    <!-- 第3行：串口参数设置 -->
    <div class="param-row">
      <div class="param-item">
        <span class="param-label">波特率</span>
        <el-select v-model="baudRate" size="small" class="param-select" :disabled="isConnected">
          <el-option v-for="br in baudRates" :key="br" :label="br" :value="br" />
        </el-select>
      </div>

      <div class="param-item">
        <span class="param-label">数据位</span>
        <el-select v-model="dataBits" size="small" class="param-select" :disabled="isConnected">
          <el-option label="5" :value="5" />
          <el-option label="6" :value="6" />
          <el-option label="7" :value="7" />
          <el-option label="8" :value="8" />
        </el-select>
      </div>

      <div class="param-item">
        <span class="param-label">校验位</span>
        <el-select v-model="parity" size="small" class="param-select" :disabled="isConnected">
          <el-option label="无" value="none" />
          <el-option label="偶校验" value="even" />
          <el-option label="奇校验" value="odd" />
        </el-select>
      </div>

      <div class="param-item">
        <span class="param-label">停止位</span>
        <el-select v-model="stopBits" size="small" class="param-select" :disabled="isConnected">
          <el-option label="1" :value="1" />
          <el-option label="2" :value="2" />
        </el-select>
      </div>

      <el-button icon="More" size="small" class="more-btn" @click="showMoreSettings = !showMoreSettings">
        更多
      </el-button>
    </div>

    <!-- 第4行：命令组及命令 -->
    <div class="preset-commands-row">
      <PresetCommands
        :is-connected="isConnected"
        :connection="connection"
        ref="presetCommandsRef"
        @commandSent="handleCommandSent"
        @commandSentContent="appendCommandToTerminal"
      />
    </div>

    <!-- 第5行：发送输入框 -->
    <div class="terminal-input">
      <span class="prompt">></span>
      <input
        v-model="currentCommand"
        @keydown.enter="sendCommand"
        placeholder="输入命令并按回车发送..."
        ref="commandInput"
        :disabled="!isConnected"
        class="command-input"
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
import FileUtils from '../utils/FileUtils'

const emit = defineEmits(['onClose', 'commandSent'])
const props = withDefaults(defineProps<{
  connection: {
    id: number
    connectionType: string
    comName?: string
    baudRate?: number
    dataBits?: number
    stopBits?: number
    parity?: string
    name?: string
    sessionId: string
  }
  autoConnect?: boolean
  onClose?: () => void
}>(), {
  autoConnect: true
})

const MAX_CLEAR_INTERVAL_SIZE = 1024 * 1024 * 30

const currentCommand = ref('')
const rxBytes = ref('0 B')
const txBytes = ref('0 B')
const commandInput = ref<HTMLInputElement>(null)
const isConnected = ref(false)
const isConnecting = ref(false)
const isPinned = ref(false)
const showTimestamp = ref(true)
const isHexMode = ref(false)
const showMoreSettings = ref(false)
const editorContainer = ref<HTMLElement | null>(null)
const output = ref('')

let editor: monaco.editor.IStandaloneCodeEditor | null = null
let editorModel: monaco.editor.ITextModel | null = null
let removeDataListener: (() => void) | null = null
let removeCloseListener: (() => void) | null = null

let totalRxSize = 0
let totalTxSize = 0
let totalRecvSize = 0

const presetCommandsRef = ref<InstanceType<typeof PresetCommands>>()

// 串口参数
const baudRates = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]
const baudRate = ref(props.connection.baudRate || 9600)
const dataBits = ref(props.connection.dataBits || 8)
const stopBits = ref(props.connection.stopBits || 1)
const parity = ref(props.connection.parity || 'none')

const isConnectedValue = computed(() => isConnected.value)
const currentSessionId = ref<string>('')

const initEditor = async () => {
  if (!editorContainer.value) return

  const uniqueUri = monaco.Uri.parse(`com-terminal:///output-${props.connection.sessionId}.txt`)
  editorModel = monaco.editor.createModel(
    `等待连接 ${props.connection.comName}...\n`,
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
}
const appendToTerminal = (content: string) => {
  console.log('ComTerminal appendToTerminal called with:', content.substring(0, 50))
  if (!editorModel) {
    console.warn('ComTerminal: editorModel is null')
    return
  }

  const lastLine = editorModel.getLineCount()
  console.log('ComTerminal: lastLine =', lastLine)
  let lastCol = 1
  if (lastLine > 0) {
    const lineContent = editorModel.getLineContent(lastLine)
    console.log('ComTerminal: lastLineContent =', lineContent)
    lastCol = (lineContent ? lineContent.length : 0) + 1
  }
  console.log('ComTerminal: lastCol =', lastCol)

  try {
    const editResult = editorModel.pushEditOperations(
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
    console.log('ComTerminal: pushEditOperations result:', editResult)
  } catch (err) {
    console.error('ComTerminal: pushEditOperations error:', err)
    return
  }

  if (isPinned.value || editorContainer.value!.scrollHeight - editorContainer.value!.scrollTop <= editorContainer.value!.clientHeight + 50) {
    scrollToEnd()
  }

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

const handleConnect = async () => {
  isConnecting.value = true
  console.log('ComTerminal handleConnect called, sessionId:', props.connection.sessionId)
  appendToTerminal(`正在连接 ${props.connection.comName}...\n`)

  try {
    const result = await window.connectApi.startConnect({
      connectionType: 'com',
      comName: props.connection.comName,
      baudRate: baudRate.value,
      dataBits: dataBits.value,
      stopBits: stopBits.value,
      parity: parity.value,
      name: props.connection.name,
      sessionId: props.connection.sessionId
    })

    console.log('ComTerminal handleConnect result:', JSON.stringify(result))

    if (result.success) {
      currentSessionId.value = props.connection.sessionId
      isConnected.value = true
      isConnecting.value = false
      console.log('ComTerminal: about to append 连接成功')
      appendToTerminal(`连接成功!\n`)
      console.log('ComTerminal: after append 连接成功')

      // 注册数据监听
      if (removeDataListener) removeDataListener()
      removeDataListener = window.connectApi.onRecvData((data) => {
        console.log('ComTerminal onRecvData:', data)
        // 检查 connId 是否匹配
        if (data.connId !== currentSessionId.value) {
          console.log('ComTerminal: connId mismatch', data.connId, '!=', currentSessionId.value)
          return
        }
        calcRxSize(data.data.length)
        if (isHexMode.value) {
          const hexStr = data.data.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')
          appendToTerminal(hexStr + '\n')
        } else {
          let displayData = showTimestamp.value
            ? `[${new Date().toLocaleTimeString()}] ${data.data}`
            : data.data
          appendToTerminal(displayData)
        }
      })

      if (removeCloseListener) removeCloseListener()
      removeCloseListener = window.connectApi.onConnectClose((connId) => {
        console.log('ComTerminal onConnectClose:', connId)
        handleClose()
      })

      commandInput.value?.focus()
    } else {
      throw new Error(result.message || '连接失败')
    }
  } catch (error) {
    isConnecting.value = false
    appendToTerminal(`连接失败: ${(error as Error).message}\n`)
    ElMessage.error('连接失败')
  }
}

const handleClose = async () => {
  if (removeDataListener) {
    removeDataListener()
    removeDataListener = null
  }
  if (removeCloseListener) {
    removeCloseListener()
    removeCloseListener = null
  }

  try {
    await window.connectApi.stopConnect({
      connectionType: 'com',
      comName: props.connection.comName,
      sessionId: props.connection.sessionId
    })
  } catch (error) {
    console.error('关闭连接失败:', error)
  }

  isConnected.value = false
  appendToTerminal(`连接已关闭\n`)
}

const sendCommand = async () => {
  if (!currentCommand.value.trim() || !isConnected.value) return

  let sendData = currentCommand.value
  currentCommand.value = ''
  commandInput.value?.focus()

  let displayData = sendData
  if (isHexMode.value) {
    displayData = sendData.replace(/[^0-9a-fA-F\s]/g, '')
  }

  appendToTerminal(`[TX] ${sendData}\n`)
  calcTxSize(sendData.length)

  try {
    await window.connectApi.sendData({
      conn: {
        connectionType: 'com',
        comName: props.connection.comName,
        sessionId: props.connection.sessionId
      },
      command: sendData
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

const togglePin = () => {
  isPinned.value = !isPinned.value
  if (isPinned.value) {
    scrollToEnd()
  }
}

const openLogFolder = async () => {
  try {
    await window.connectApi.openConnectLog(props.connection.sessionId)
  } catch (error) {
    ElMessage.error('打开日志文件夹失败')
  }
}

const openLogFile = async () => {
  try {
    await window.connectApi.openConnectLog(props.connection.sessionId)
  } catch (error) {
    ElMessage.error('打开日志文件失败')
  }
}

const saveLog = async () => {
  if (!editorModel) return
  const content = editorModel.getValue()
  try {
    const result = await window.toolApi.saveFile({
      defaultPath: `com_${props.connection.comName}_${Date.now()}.log`,
      content: content
    })
    if (result.success) {
      ElMessage.success('日志保存成功')
    }
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const calcRxSize = (len: number) => {
  totalRxSize += len
  rxBytes.value = FileUtils.formatBytes(totalRxSize)
}

const calcTxSize = (len: number) => {
  totalTxSize += len
  txBytes.value = FileUtils.formatBytes(totalTxSize)
}

const handleCommandSent = (cmdName: string) => emit('commandSent', cmdName)

const appendCommandToTerminal = (content: string) => {
  appendToTerminal(`[TX] ${content}\n`)
  calcTxSize(content.length)
  commandInput.value?.focus()
}

const refreshGroupsCmds = () => presetCommandsRef.value.refreshGroupsCmds()

defineExpose({
  refreshGroupsCmds,
  isConnected: isConnectedValue
})

onMounted(() => {
  initEditor()
  if (props.autoConnect) {
    handleConnect()
  }
})

onUnmounted(() => {
  if (removeDataListener) {
    removeDataListener()
    removeDataListener = null
  }
  if (removeCloseListener) {
    removeCloseListener()
    removeCloseListener = null
  }

  if (editorModel) {
    editorModel.dispose()
    editorModel = null
  }

  if (editor) {
    editor.dispose()
    editor = null
  }

  if (isConnected.value) {
    window.connectApi
      .stopConnect({
        connectionType: 'com',
        comName: props.connection.comName,
        sessionId: props.connection.sessionId
      })
      .catch((err) => {
        console.error('卸载时断开失败:', err)
      })
  }
})
</script>

<style scoped>
.com-terminal {
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
}

.toolbar-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  background-color: #252526;
  border-bottom: 1px solid #333;
  flex-wrap: wrap;
}

.param-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 12px;
  background-color: #2d2d2d;
  border-bottom: 1px solid #333;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-label {
  font-size: 12px;
  color: #aaa;
  white-space: nowrap;
}

.param-select {
  width: 100px;
}

.more-btn {
  margin-left: auto;
  background-color: #3a3a3a !important;
  border-color: #444 !important;
  color: #e0e0e0 !important;
}

.preset-commands-row {
  padding: 8px 12px;
  background-color: #252526;
  border-bottom: 1px solid #333;
}

.tool-btn {
  background-color: #3a3a3a !important;
  border-color: #444 !important;
  color: #e0e0e0 !important;
  padding: 6px 12px !important;
}

.tool-btn:hover:not(:disabled) {
  background-color: #4a4a4a !important;
  border-color: #555 !important;
}

.connect-btn {
  background-color: #165dff !important;
  border-color: #3370ff !important;
  color: white !important;
  min-width: 80px;
}

.connect-btn:hover:not(:disabled) {
  background-color: #4080ff !important;
}

.connect-btn:disabled {
  background-color: #555 !important;
  border-color: #666 !important;
  color: #999 !important;
}

.close-btn {
  background-color: #ff4d4f !important;
  border-color: #ff6767 !important;
  color: white !important;
  min-width: 80px;
}

.close-btn:hover {
  background-color: #ff6b6b !important;
}

.tool-checkbox {
  color: #e0e0e0 !important;
}

.tool-switch {
  --el-switch-on-color: #165dff;
  --el-switch-off-color: #444;
}

.rx-tx-info {
  display: flex;
  gap: 12px;
  margin-left: auto;
  font-size: 12px;
}

.rx-tx-info .rx {
  color: #4ade80;
}

.rx-tx-info .tx {
  color: #60a5fa;
}

.terminal-input {
  display: flex;
  align-items: center;
  background-color: #333;
  padding: 8px 0;
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
  background: #333;
  border: none;
  color: #fff;
  padding: 8px 10px;
  outline: none;
  font-family: monospace;
  font-size: 14px;
}

.command-input::placeholder {
  color: #666;
}

.command-input:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.send-btn {
  margin-right: 10px;
  background-color: #165dff !important;
  border-color: #3370ff !important;
  color: white !important;
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
  bottom: 150px;
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

:deep(.el-select) {
  --el-select-border-color-hover: #409eff;
}

:deep(.el-input__wrapper) {
  background-color: #3a3a3a !important;
  box-shadow: none !important;
}

:deep(.el-input__inner) {
  color: #e0e0e0 !important;
}
</style>
