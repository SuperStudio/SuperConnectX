<!-- TelnetTerminal.vue -->
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

const emit = defineEmits(['onClose', 'commandSent'])

// 接收父组件传递的连接参数和关闭回调
const props = defineProps<{
  connection: { id: number; host: string; port: number; name?: string }
  onClose?: () => void
}>()

const currentCommand = ref('') // 当前输入的命令
const commandInput = ref<HTMLInputElement>(null) // 输入框引用
const isConnected = ref(true) // 连接状态标识
let removeDataListener: (() => void) | null = null
let removeCloseListener: (() => void) | null = null
let currentConnId = 0 // 当前连接的 ID

// 显示日志开关（默认勾选）
const isShowLog = ref(true)
const isAutoScroll = ref(true)
const editorContainer = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let editorModel: monaco.editor.ITextModel | null = null // 直接持有模型，不通过 Vue 响应式

// 重试相关标记
const MAX_RETRY_COUNT = 1000 // 最大重试次数
const RETRY_INTERVAL_MS = 3000
let retryCount = 0 // 当前重试次数
let retryTimer: NodeJS.Timeout | null = null // 重试定时器
let stopRetry = ref(false) // 是否停止重试（点击断开后设为true）

const MAX_CLEAR_INTERVAL_SIZE = 1024 * 1024 * 1
let totalRecvSize = 0

// 初始化编辑器
const initEditor = async () => {
  if (!editorContainer.value) return

  editorModel = monaco.editor.createModel(
    `正在尝试连接 ${props.connection.host}:${props.connection.port}...\n`,
    'plaintext',
    monaco.Uri.parse('telnet-terminal:///output.txt')
  )

  // 2. 创建编辑器，绑定独立模型
  editor = monaco.editor.create(editorContainer.value, {
    model: editorModel,
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    theme: 'vs-dark',
    automaticLayout: true,
    // 关闭所有可能触发线程竞争的功能
    hover: { enabled: false },
    occurrencesHighlight: 'off',
    selectionHighlight: false,
    codeLens: false,
    links: false
  })

  // 3. 禁用 Vue 对编辑器的响应式监听（关键）
  editor.updateOptions({ readOnly: true })
}

const appendToTerminal = (content: string) => {
  if (!editorModel) return

  // 关键：用模型的 pushEdit 替代编辑器的 setValue，避免触发渲染线程死锁
  // 记录追加前的滚动位置（用于取消自动滚动时保留位置）
  const lastLine = editorModel.getLineCount()
  const lastCol = editorModel.getLineContent(lastLine).length + 1

  // 同步编辑模型（Electron 下同步操作更稳定）
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
    editor?.revealLine(newLastLine) // 滚动到最后一行
  } else {
    // editor?.setScrollPosition(scrollPosition) // 恢复原有滚动位置
  }

  totalRecvSize += content.length
  if (totalRecvSize > MAX_CLEAR_INTERVAL_SIZE) {
    clearTerminal()
  }
}
const getCurrentConnect = () => {
  return {
    id: props.connection.id,
    host: props.connection.host,
    port: props.connection.port,
    name: props.connection.name
  }
}

// 打开日志文件
const openLogFile = async () => {
  try {
    console.log('请求打开日志文件')
    const result = await window.telnetApi.openTelnetLog(getCurrentConnect())
    if (!result.success) {
      ElMessage.error(`打开日志失败：${result.message}`)
    }
  } catch (error) {
    console.error('打开日志异常:', error)
    ElMessage.error('打开日志失败：' + (error instanceof Error ? error.message : '未知错误'))
  }
}

// 处理关闭连接
const handleClose = async () => {
  // 标记停止重试
  stopRetry.value = true
  // 清除重试定时器
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

// 处理连接关闭
const handleTelnetClose = (connId: number) => {
  if (connId === currentConnId) {
    ElMessage.info('连接已关闭，将尝试重新连接...')
    isConnected.value = false
    currentConnId = 0
    appendToTerminal(`连接已关闭，将在${RETRY_INTERVAL_MS / 1000}秒后尝试重连...\n`)
    if (!stopRetry.value) {
      // 延迟一点再重连，避免立即重试可能的资源竞争
      setTimeout(connect, 1000)
    }
  }
}

// 连接 Telnet 服务器
// 连接逻辑（含重试）
// 修改连接成功后的逻辑，增加初始化信息清理机制
const connect = async () => {
  // 重置状态（保持原有代码）
  stopRetry.value = false
  retryCount = 0
  isConnected.value = false
  currentConnId = 0

  // 新增：记录是否是首次连接
  let isFirstConnect = true

  const attemptConnect = async () => {
    if (stopRetry.value) {
      console.log(`\n已手动停止重连，终止尝试\n`)
      return
    }

    try {
      const result = await window.telnetApi.connectTelnet(getCurrentConnect())
      if (result.success) {
        // 1. 确保先移除旧的监听
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

        // 2. 注册新的监听，增加初始化信息过滤
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
              // 只保留首次连接的初始化信息
              if (isFirstConnect) {
                appendToTerminal(formattedData)
                isFirstConnect = false // 标记为非首次连接
              }
            } else {
              // 非初始化信息正常显示
              appendToTerminal(formattedData)
            }
          }
        })

        removeCloseListener = window.telnetApi.onTelnetClose(handleTelnetClose)
        commandInput.value?.focus()
        appendToTerminal(`connect success, retry count: ${retryCount + 1}\n`)
        retryCount = 0
        isFirstConnect = false // 重置首次连接标记
      } else {
        throw new Error(result.message || '连接失败')
      }
    } catch (error) {
      // 保持原有错误处理逻辑
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

// 发送命令
const sendCommand = async () => {
  if (!currentCommand.value.trim() || !isConnected.value) return

  let sendData = currentCommand.value
  currentCommand.value = ''
  commandInput.value?.focus()
  appendToTerminal(`[${new Date().toISOString()}] SEND >>>>>>>>>> ${sendData}\n`)

  try {
    await window.telnetApi.telnetSend({
      conn: getCurrentConnect(),
      command: sendData.trim()
    })
  } catch (error) {
    ElMessage.error('命令发送失败')
    console.error('发送失败:', error)
  }
}

// 组件卸载清理
onUnmounted(() => {
  console.log('组件卸载：强制清理所有监听和连接')

  stopRetry.value = true
  if (retryTimer) clearTimeout(retryTimer)

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

// 清空屏幕
const clearTerminal = () => {
  if (editorModel) {
    // 清空：直接重置模型内容，而非编辑器 setValue
    editorModel.setValue('')
  }
  commandInput.value?.focus()
  totalRecvSize = 0
}

onMounted(() => {
  initEditor()
  connect()
})

// 新增处理命令发送的回调
const handleCommandSent = (cmdName: string) => {
  emit('commandSent', cmdName)
}

// 追加命令到终端显示
const appendCommandToTerminal = (content: string) => {
  appendToTerminal(`[${new Date().toISOString()}] SEND >>>>>>>>>> ${content}\n`)
  commandInput.value?.focus()
}
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

/* 头部样式 */
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

/* 连接信息 */
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

/* 按钮组 */
.header-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-right: 10px;
}

/* 按钮样式 */
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

/* 终端输出区域 */
.terminal-output {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
  white-space: pre-wrap;
  line-height: 1.5;
  background-color: #1e1e1e;
  position: relative;
}

/* 空状态样式 */
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

/* 命令输入区域样式调整 */
.terminal-input {
  display: flex;
  align-items: center; /* 垂直居中对齐 */
  border-radius: 0px;
}
/* 命令输入区域样式调整 */
.terminal-input {
  display: flex;
  align-items: center; /* 垂直居中对齐 */
  background-color: #333;
}

/* 命令提示符样式 */
.prompt {
  color: #cccccc; /* 绿色提示符，可自定义 */
  font-weight: bold;
  white-space: nowrap; /* 防止换行 */
  margin-left: 10px;
  user-select: none; /* 核心：禁止文本选择 */
}

/* 输入框样式保持不变，但可以移除左右内边距避免整体过宽 */
.terminal-input input {
  flex: 1;
  background: #333;
  border: none;
  color: #fff;
  padding: 8px 10px; /* 只保留上下内边距 */
  outline: none;
  font-family: monospace;
}

/* 复选框样式 */
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

/* 右键菜单样式 */
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

/* 滚动条美化 */
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

/* 动画效果 */
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

/* Element Plus 弹窗表单样式适配 */
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
