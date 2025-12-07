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
          :disabled="!isConnected || output === ''"
        >
          清空屏幕
        </el-button>

        <el-button
          type="default"
          icon="Document"
          size="small"
          class="log-btn"
          @click="openLogFile"
          :disabled="!isConnected"
        >
          打开日志
        </el-button>

        <el-button
          type="danger"
          icon="Close"
          size="small"
          class="close-btn"
          @click="handleClose"
          :disabled="!isConnected"
        >
          关闭连接
        </el-button>
      </div>
    </div>

    <!-- 终端输出区域 -->
    <div ref="editorContainer" class="terminal-output"></div>
    <div class="preset-commands">
      <el-button
        type="primary"
        icon="Plus"
        size="small"
        @click="openAddPresetDialog"
        :disabled="!isConnected"
        class="add-preset-btn"
      >
        新增命令
      </el-button>

      <el-button
        v-for="cmd in presetCommands"
        :key="cmd.id"
        type="default"
        size="small"
        class="preset-btn"
        :class="{ looping: loopStatus[cmd.id] }"
        @click="sendPresetCommand(cmd)"
        @contextmenu.prevent="showContextMenu(cmd, $event)"
      >
        {{ cmd.name }}
        <template v-if="loopStatus[cmd.id]">🔄</template>
      </el-button>
    </div>

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
    <el-dialog
      :title="isEditing ? '编辑命令' : '新增命令'"
      v-model="isPresetDialogOpen"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form :model="presetForm" :rules="presetRules" ref="presetFormRef" label-width="120px">
        <el-form-item label="命令名称" prop="name">
          <el-input v-model="presetForm.name" placeholder="输入命令名称" />
        </el-form-item>
        <el-form-item label="命令内容" prop="command">
          <el-input v-model="presetForm.command" placeholder="输入命令内容" />
        </el-form-item>
        <el-form-item label="时延(ms)" prop="delay">
          <el-input
            v-model.number="presetForm.delay"
            type="number"
            placeholder="命令发送后等待时间"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="isPresetDialogOpen = false">取消</el-button>
        <el-button type="primary" @click="savePresetCommand">保存</el-button>
      </template>
    </el-dialog>

    <div
      v-if="contextMenuVisible"
      :style="{ left: contextMenuLeft + 'px', top: contextMenuTop + 'px' }"
      class="context-menu-container"
      @click.stop
      @contextmenu.prevent
    >
      <el-menu class="context-menu" mode="vertical" :collapse="false" :collapse-transition="false">
        <el-menu-item class="menu-item" @click="editPresetCommand(currentEditingCmd)">
          编辑
        </el-menu-item>
        <el-menu-item
          class="menu-item delete-item"
          @click="deletePresetCommand(currentEditingCmd.id)"
        >
          删除
        </el-menu-item>

        <el-menu-item class="menu-item" @click="toggleLoopSend(currentEditingCmd)">
          {{ loopStatus[currentEditingCmd.id] ? '取消循环' : '循环发送' }}
        </el-menu-item>
      </el-menu>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElForm } from 'element-plus'
import * as monaco from 'monaco-editor'

const emit = defineEmits(['onClose'])

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

// 循环发送相关
const loopIntervals = ref<Record<number, NodeJS.Timeout>>({})
const loopStatus = ref<Record<number, boolean>>({})

const editorContainer = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let editorModel: monaco.editor.ITextModel | null = null // 直接持有模型，不通过 Vue 响应式

const initEditor = async () => {
  if (!editorContainer.value) return

  // 1. 先创建独立文本模型（脱离 Vue 响应式）
  editorModel = monaco.editor.createModel(
    `success connect to ${props.connection.host}:${props.connection.port}\n`,
    'plaintext',
    monaco.Uri.parse('telnet-terminal:///output.txt') // 自定义 URI，避免模型冲突
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
}

// 切换循环发送状态
const toggleLoopSend = (cmd: any) => {
  contextMenuVisible.value = false

  if (loopStatus.value[cmd.id]) {
    if (loopIntervals.value[cmd.id]) {
      clearInterval(loopIntervals.value[cmd.id])
      delete loopIntervals.value[cmd.id]
    }
    loopStatus.value[cmd.id] = false
    ElMessage.success(`已停止循环发送: ${cmd.name}`)
    return
  }

  loopStatus.value[cmd.id] = true
  sendPresetCommand(cmd)

  const intervalTime = Math.max(cmd.delay || 1000, 100)
  loopIntervals.value[cmd.id] = setInterval(() => {
    sendPresetCommand(cmd)
  }, intervalTime)

  ElMessage.success(`已开始循环发送: ${cmd.name} (间隔${intervalTime}ms)`)
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
    const result = await window.electronStore.openTelnetLog(getCurrentConnect())
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
  if (currentConnId) {
    try {
      await window.electronStore.telnetDisconnect(currentConnId)
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

// 处理主进程发送的 Telnet 数据
const handleTelnetData = (data: { connId: number; data: string }) => {
  if (data.connId !== currentConnId) return
  if (isShowLog.value) {
    const formattedData = data.data.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\0/g, '') // 过滤空字符
    appendToTerminal(formattedData)
  }
}

// 处理连接关闭
const handleTelnetClose = (connId: number) => {
  if (connId === currentConnId) {
    ElMessage.info('连接已关闭')
    isConnected.value = false
    currentConnId = 0
    emit('onClose')
    if (typeof props.onClose === 'function') {
      props.onClose()
    }
  }
}

// 连接 Telnet 服务器
const connect = async () => {
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

  try {
    const result = await window.electronStore.connectTelnet(getCurrentConnect())
    if (result.success) {
      currentConnId = result.connId
      isConnected.value = true
      removeDataListener = window.electronStore.onTelnetData(handleTelnetData)
      removeCloseListener = window.electronStore.onTelnetClose(handleTelnetClose)
      commandInput.value?.focus()
    } else {
      ElMessage.error(result.message)
      isConnected.value = false
      emit('onClose')
      if (typeof props.onClose === 'function') {
        props.onClose()
      }
    }
  } catch (error) {
    console.error('连接失败:', error)
    ElMessage.error('连接失败')
    isConnected.value = false
    emit('onClose')
    if (typeof props.onClose === 'function') {
      props.onClose()
    }
  }
}

// 发送命令
const sendCommand = async () => {
  if (!currentCommand.value.trim() || !isConnected.value) return

  let sendData = currentCommand.value
  currentCommand.value = ''
  commandInput.value?.focus()
  appendToTerminal(`[${new Date().toISOString()}] SEND >>>>>>>>>> ${sendData}\n`)

  try {
    await window.electronStore.telnetSend({
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

  Object.values(loopIntervals.value).forEach((interval) => {
    clearInterval(interval)
  })

  if (currentConnId && isConnected.value) {
    window.electronStore.telnetDisconnect(currentConnId).catch((err) => {
      console.error('卸载时断开失败:', err)
    })
  }
})

// 命令预设相关
const presetCommands = ref<any[]>([])
const isPresetDialogOpen = ref(false)
const isEditing = ref(false)
const currentEditingCmd = ref<any>(null)
const contextMenuVisible = ref(false)
const contextMenuLeft = ref(0)
const contextMenuTop = ref(0)

// 预设命令表单
const presetForm = ref({
  name: '',
  command: '',
  delay: 0
})

// 表单验证规则
const presetRules = ref({
  name: [{ required: true, message: '请输入命令名称', trigger: 'blur' }],
  command: [{ required: true, message: '请输入命令内容', trigger: 'blur' }],
  delay: [
    { required: true, message: '请输入时延', trigger: 'blur' },
    { type: 'number', min: 0, message: '时延不能为负数', trigger: 'blur' }
  ]
})

// 表单引用
const presetFormRef = ref<InstanceType<typeof ElForm> | null>(null)

// 加载预设命令
const loadPresetCommands = async () => {
  try {
    const commands = await window.electronStore.getPresetCommands()
    presetCommands.value = Array.isArray(commands) ? commands : []
  } catch (error) {
    console.error('加载命令失败:', error)
    ElMessage.error('加载命令失败')
  }
}

// 打开新增预设命令对话框
const openAddPresetDialog = () => {
  isEditing.value = false
  currentEditingCmd.value = null
  presetForm.value = {
    name: '',
    command: '',
    delay: 0
  }
  isPresetDialogOpen.value = true
}

// 打开编辑预设命令对话框
const editPresetCommand = (cmd: any) => {
  contextMenuVisible.value = false
  isEditing.value = true
  currentEditingCmd.value = cmd
  presetForm.value = {
    name: cmd.name,
    command: cmd.command,
    delay: cmd.delay
  }
  isPresetDialogOpen.value = true
}

// 保存预设命令
const savePresetCommand = async () => {
  if (!presetFormRef.value) return

  try {
    await presetFormRef.value.validate()

    const pureFormData = {
      name: presetForm.value.name.trim(),
      command: presetForm.value.command.trim(),
      delay: Number(presetForm.value.delay) || 0
    }

    if (isEditing.value && currentEditingCmd.value) {
      const updatedCmd = {
        id: currentEditingCmd.value.id,
        ...pureFormData
      }
      await window.electronStore.updatePresetCommand(JSON.parse(JSON.stringify(updatedCmd)))
      ElMessage.success('命令已更新')
    } else {
      await window.electronStore.addPresetCommand(JSON.parse(JSON.stringify(pureFormData)))
      ElMessage.success('命令已添加')
    }

    loadPresetCommands()
    isPresetDialogOpen.value = false
  } catch (error) {
    console.error('保存命令失败:', error)
    ElMessage.error('保存失败：' + (error as Error).message)
  }
}

// 删除预设命令
const deletePresetCommand = async (id: number) => {
  contextMenuVisible.value = false
  try {
    await window.electronStore.deletePresetCommand(id)
    ElMessage.success('命令已删除')
    loadPresetCommands()
  } catch (error) {
    console.error('删除命令失败:', error)
    ElMessage.error('删除命令失败')
  }
}

// 显示右键菜单
const showContextMenu = (cmd: any, event: MouseEvent) => {
  event.preventDefault() // 阻止浏览器默认右键菜单
  event.stopPropagation() // 阻止事件冒泡

  // 记录当前操作的命令
  currentEditingCmd.value = cmd

  // 获取菜单元素预估高度（每个菜单项约40px，3个菜单项+边框约124px）
  const menuHeight = 124
  // 获取屏幕可见区域高度
  const screenHeight = window.innerHeight

  // 计算基础位置
  let left = event.clientX
  let top = event.clientY

  // 防止菜单底部超出屏幕
  if (top + menuHeight > screenHeight) {
    top = screenHeight - menuHeight - 10 // 向上调整位置，留10px边距
  }

  // 防止菜单右侧超出屏幕
  if (left + 120 > window.innerWidth) {
    // 120是菜单宽度
    left = window.innerWidth - 120 - 10 // 向左调整位置
  }

  // 设置菜单位置
  contextMenuLeft.value = left
  contextMenuTop.value = top

  // 显示菜单
  contextMenuVisible.value = true
}

// 点击外部关闭右键菜单
const closeContextMenuOnClickOutside = (event: MouseEvent) => {
  const contextMenu = document.querySelector('.context-menu')
  if (contextMenu && !contextMenu.contains(event.target as Node)) {
    contextMenuVisible.value = false
  }
}

// 发送预设命令
const sendPresetCommand = async (cmd: any) => {
  if (!isConnected.value) return

  try {
    if (cmd.delay > 0) {
      setTimeout(() => {
        window.electronStore.telnetSend({
          conn: getCurrentConnect(),
          command: cmd.command.trim()
        })
        appendToTerminal(`[${new Date().toISOString()}] SEND >>>>>>>>>> ${cmd.command}\n`)
        commandInput.value?.focus()
      }, cmd.delay)
    } else {
      window.electronStore.telnetSend({
        conn: getCurrentConnect(),
        command: cmd.command.trim()
      })
      appendToTerminal(`[${new Date().toISOString()}] SEND >>>>>>>>>> ${cmd.command}\n`)
      commandInput.value?.focus()
    }
  } catch (error) {
    ElMessage.error('命令发送失败')
    console.error('发送失败:', error)
  }
}

// 清空屏幕
const clearTerminal = () => {
  if (editorModel) {
    // 清空：直接重置模型内容，而非编辑器 setValue
    editorModel.setValue('')
  }
  commandInput.value?.focus()
}

onMounted(() => {
  loadPresetCommands()
  document.addEventListener('click', closeContextMenuOnClickOutside)
  document.addEventListener('contextmenu', () => {
    contextMenuVisible.value = false
  })
  // 初始化连接
  connect().then(() => {
    initEditor()
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeContextMenuOnClickOutside)
  document.removeEventListener('contextmenu', () => {
    contextMenuVisible.value = false
  })
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

.add-preset-btn {
  background-color: #165dff !important;
  border-color: #165dff !important;
}

.add-preset-btn:hover {
  background-color: #0e4ada !important;
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

/* 预设命令区域 */
.preset-commands {
  padding: 8px 15px;
  border-bottom: 1px solid #333;
  background: #252526;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  max-height: 100px;
  overflow-y: auto;
}

.preset-commands::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.preset-commands::-webkit-scrollbar-thumb {
  background-color: #444;
  border-radius: 3px;
}

/* 预设命令按钮 */
.preset-btn {
  background-color: #3a3a3a !important;
  border-color: #444 !important;
  color: #e0e0e0 !important;
  margin: 2px 0 !important;
  transition: all 0.2s ease !important;
  position: relative !important;
  z-index: 1 !important;
}

.preset-btn:hover {
  background-color: #4a4a4a !important;
  border-color: #555 !important;
  transform: translateY(-1px);
}

.preset-btn.looping {
  animation: pulse 1.5s infinite;
  border-color: #165dff !important;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(22, 93, 255, 0.4);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(22, 93, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(22, 93, 255, 0);
  }
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
</style>
