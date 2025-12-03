<!-- TelnetTerminal.vue -->
<template>
  <div class="telnet-terminal">
    <!-- 新增关闭按钮 -->
    <div class="terminal-header">
      <span class="connection-info"> {{ connection.host }}:{{ connection.port }} </span>
      <div class="header-buttons">
        <el-checkbox v-model="isShowLog" class="show-log-checkbox" size="small">
          显示日志
        </el-checkbox>
        <el-checkbox
          v-model="isAutoScroll"
          class="auto-scroll-checkbox"
          size="small"
          @change="handleAutoScrollChange"
        >
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

    <!-- 新增：命令预设行 -->
    <div class="preset-commands">
      <el-button
        type="primary"
        icon="Plus"
        size="small"
        @click="openAddPresetDialog"
        :disabled="!isConnected"
      >
        新增命令
      </el-button>

      <!-- 修改：每个命令按钮添加右键事件 -->
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

    <!-- 终端输出区域 -->
    <div class="terminal-output" v-html="output" ref="terminalOutputRef"></div>

    <!-- 命令输入区域 -->
    <div class="terminal-input">
      <input
        v-model="currentCommand"
        @keydown.enter="sendCommand"
        placeholder="输入命令并并按回车..."
        ref="commandInput"
        :disabled="!isConnected"
      />
    </div>

    <!-- 新增命令对话框 -->
    <el-dialog
      :title="isEditing ? '编辑预设命令' : '新增预设命令'"
      v-model="isPresetDialogOpen"
      width="400px"
    >
      <el-form :model="presetForm" :rules="presetRules" ref="presetFormRef" label-width="80px">
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
import { ref, onUnmounted, onMounted, onBeforeUnmount, watch, ref as vueRef } from 'vue'
import { ElMessage } from 'element-plus'
import { Close, Document } from '@element-plus/icons-vue' // 导入关闭图标

const emit = defineEmits(['onClose'])

// 接收父组件传递的连接参数和关闭回调
const props = defineProps<{
  connection: { id: number; host: string; port: number }
  onClose?: () => void
}>()

const output = ref('') // 终端输出内容
const currentCommand = ref('') // 当前输入的命令
const commandInput = vueRef<HTMLInputElement>(null) // 输入框引用
const isConnected = ref(true) // 新增连接状态标识
let removeDataListener: (() => void) | null = null
let removeCloseListener: (() => void) | null = null
let currentConnId = 0 // 当前连接的 ID

// 新增：显示日志开关（默认勾选）
const isShowLog = ref(true) // 控制是否在界面显示日志，默认显示
const isAutoScroll = ref(true) // 自动滚动状态，默认勾选
const terminalOutputRef = ref<HTMLDivElement | null>(null) // 输出区域DOM引用

// 记录循环发送的定时器ID
const loopIntervals = ref<Record<number, NodeJS.Timeout>>({})
// 记录命令是否处于循环发送中
const loopStatus = ref<Record<number, boolean>>({})

// 切换循环发送状态
const toggleLoopSend = (cmd: any) => {
  contextMenuVisible.value = false

  // 如果已经在循环发送，清除定时器
  if (loopStatus.value[cmd.id]) {
    if (loopIntervals.value[cmd.id]) {
      clearInterval(loopIntervals.value[cmd.id])
      delete loopIntervals.value[cmd.id]
    }
    loopStatus.value[cmd.id] = false
    ElMessage.success(`已停止循环发送: ${cmd.name}`)
    return
  }

  // 开始循环发送
  loopStatus.value[cmd.id] = true

  // 立即发送一次
  sendPresetCommand(cmd)

  // 设置定时器，根据延迟时间循环发送
  const intervalTime = Math.max(cmd.delay || 1000, 100) // 最小100ms防止过于频繁
  loopIntervals.value[cmd.id] = setInterval(() => {
    sendPresetCommand(cmd)
  }, intervalTime)

  ElMessage.success(`已开始循环发送: ${cmd.name} (间隔${intervalTime}ms)`)
}

// 自动滚动状态变化处理
const handleAutoScrollChange = (value: boolean) => {
  // 如果勾选，立即滚动到最底部
  if (value) {
    scrollToBottom()
  }
}

// 新增：打开日志文件
const openLogFile = async () => {
  try {
    console.log('请求打开日志文件')
    const result = await window.electronStore.openTelnetLog()
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
      output.value += '<br>--- 连接已手动关闭 ---'
      isConnected.value = false

      // 优先用 emit 触发父组件事件（Vue 推荐的组件通信方式）
      emit('onClose')
      // 兼容旧的 props.onClose（如果父组件仍用 props 传递）
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
      // 更新状态
      output.value += '<br>--- 连接已手动关闭 ---'
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
  if (data.connId === currentConnId) {
    if (isShowLog.value) {
      output.value += data.data.replace(/\r\n/g, '<br>').replace(/\n/g, '<br>')
    }
    scrollToBottom()
  }
}

// 处理连接关闭
const handleTelnetClose = (connId: number) => {
  if (connId === currentConnId) {
    ElMessage.info('连接已关闭')
    output.value += '<br>--- 连接已关闭 ---'
    isConnected.value = false
    currentConnId = 0 // 清空连接 ID，避免重复触发
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

  // 重置状态
  isConnected.value = false
  currentConnId = 0
  output.value = ''

  try {
    const cleanConn = {
      id: props.connection.id,
      host: props.connection.host,
      port: props.connection.port
    }
    const result = await window.electronStore.connectTelnet(cleanConn)
    if (result.success) {
      currentConnId = result.connId
      isConnected.value = true
      output.value = `成功连接到 ${cleanConn.host}:${cleanConn.port}<br>`
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

// 发送命令到 Telnet 服务器
const sendCommand = async () => {
  if (!currentCommand.value.trim() || !isConnected.value) return

  output.value += `> ${currentCommand.value}<br>`
  let sendData = currentCommand.value
  currentCommand.value = ''
  commandInput.value?.focus()

  try {
    await window.electronStore.telnetSend({
      connId: currentConnId,
      command: sendData.trim()
    })
  } catch (error) {
    ElMessage.error('命令发送失败')
    console.error('发送失败:', error)
  }

  scrollToBottom()
}

// 滚动到终端底部
const scrollToBottom = () => {
  if (isAutoScroll.value && terminalOutputRef.value) {
    const outputElement = terminalOutputRef.value
    outputElement.scrollTop = outputElement.scrollHeight
  }
}

watch(
  () => output.value,
  () => {
    scrollToBottom()
  }
)

// 组件卸载时移除监听、断开连接
onUnmounted(() => {
  console.log('组件卸载：强制清理所有监听和连接')
  if (removeDataListener) {
    removeDataListener()
    removeDataListener = null
  }
  if (removeCloseListener) {
    removeCloseListener()
    removeCloseListener = null
  }

  // 清除所有循环发送定时器
  Object.values(loopIntervals.value).forEach((interval) => {
    clearInterval(interval)
  })

  // 强制断开连接
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
    console.error('加载预设命令失败:', error)
    ElMessage.error('加载预设命令失败')
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
// 保存预设命令（修改这里）
const savePresetCommand = async () => {
  if (!presetFormRef.value) return

  try {
    await presetFormRef.value.validate()

    // 关键：创建纯 JavaScript 对象，去除 Vue 响应式属性
    const pureFormData = {
      name: presetForm.value.name.trim(),
      command: presetForm.value.command.trim(),
      delay: Number(presetForm.value.delay) || 0 // 确保是数字类型
    }

    if (isEditing.value && currentEditingCmd.value) {
      // 更新现有命令
      const updatedCmd = {
        id: currentEditingCmd.value.id,
        ...pureFormData
      }
      // 再次序列化确保安全
      await window.electronStore.updatePresetCommand(JSON.parse(JSON.stringify(updatedCmd)))
      ElMessage.success('命令已更新')
    } else {
      // 添加新命令
      await window.electronStore.addPresetCommand(JSON.parse(JSON.stringify(pureFormData)))
      ElMessage.success('命令已添加')
    }

    // 重新加载命令列表
    loadPresetCommands()
    isPresetDialogOpen.value = false
  } catch (error) {
    console.error('保存预设命令失败:', error)
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
    console.error('删除预设命令失败:', error)
    ElMessage.error('删除命令失败')
  }
}

// 打开右键菜单
const openContextMenu = (cmd: any, event: MouseEvent) => {
  event.preventDefault()
  currentEditingCmd.value = cmd
  contextMenuVisible.value = true

  // 定位菜单到鼠标位置
  const menu = document.querySelector('.el-dropdown-menu')
  if (menu) {
    menu.style.position = 'fixed'
    menu.style.left = `${event.clientX}px`
    menu.style.top = `${event.clientY}px`
  }
}

// 发送预设命令
const sendPresetCommand = async (cmd: any) => {
  if (!isConnected.value) return

  try {
    // 如果有时延，等待后再聚焦输入框
    if (cmd.delay > 0) {
      setTimeout(() => {
        window.electronStore.telnetSend({
          connId: currentConnId,
          command: cmd.command.trim()
        })
        output.value += `[${new Date().toISOString()}] SEND >>>>>>>>>> ${cmd.command}<br>`
        commandInput.value?.focus()
      }, cmd.delay)
    } else {
      window.electronStore.telnetSend({
        connId: currentConnId,
        command: cmd.command.trim()
      })
      output.value += `[${new Date().toISOString()}] SEND >>>>>>>>>> ${cmd.command}<br>`
      commandInput.value?.focus()
    }

    scrollToBottom()
  } catch (error) {
    ElMessage.error('命令发送失败')
    console.error('发送失败:', error)
  }
}

onMounted(() => {
  loadPresetCommands()
  document.addEventListener('click', closeContextMenuOnClickOutside)
  document.addEventListener('contextmenu', () => {
    contextMenuVisible.value = false
  })
  // 初始滚动到底部
  setTimeout(scrollToBottom, 100)
})

// 右键菜单相关（修改部分）
const contextMenuLeft = ref(0) // 菜单左侧位置
const contextMenuTop = ref(0) // 菜单顶部位置

// 显示右键菜单（修改）
const showContextMenu = (cmd: any, event: MouseEvent) => {
  event.preventDefault() // 阻止浏览器默认右键菜单
  event.stopPropagation() // 阻止事件冒泡

  // 记录当前操作的命令
  currentEditingCmd.value = cmd

  // 设置菜单位置（基于鼠标坐标）
  contextMenuLeft.value = event.clientX
  contextMenuTop.value = event.clientY

  // 显示菜单
  contextMenuVisible.value = true
}

// 点击页面其他地方关闭菜单（新增）
const closeContextMenuOnClickOutside = (event: MouseEvent) => {
  const contextMenu = document.querySelector('.context-menu')
  if (contextMenu && !contextMenu.contains(event.target as Node)) {
    contextMenuVisible.value = false
  }
}

// 移除事件监听（新增）
onBeforeUnmount(() => {
  document.removeEventListener('click', closeContextMenuOnClickOutside)
  document.removeEventListener('contextmenu', () => {
    contextMenuVisible.value = false
  })
})

// 新增：清空屏幕功能
const clearTerminal = () => {
  output.value = '' // 清空输出内容
  ElMessage.success('屏幕已清空')
  commandInput.value?.focus() // 清空后聚焦输入框
}

// 初始化时自动连接
connect()
</script>

<style scoped>
.telnet-terminal {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #000;
  color: #fff;
  font-family: monospace;
}

/* 右侧按钮组样式 */
.header-buttons {
  display: flex;
  gap: 8px; /* 按钮之间间距 */
  align-items: center; /* 新增：垂直居中 */
  margin-right: 10px;
}

/* 按钮样式优化（统一按钮风格） */
.log-btn,
.close-btn,
.clear-btn {
  padding: 6px 12px !important;
  border-radius: 4px !important;
}

/* 打开日志按钮（默认样式） */
.log-btn {
  background-color: #3a3a3a !important;
  border-color: #444 !important;
  color: #e0e0e0 !important;
}

.log-btn:hover {
  background-color: #4a4a4a !important;
  border-color: #555 !important;
}

/* 关闭连接按钮（危险样式） */
.close-btn {
  background-color: #ff4d4f !important;
  border-color: #ff6767 !important;
  color: white !important;
}

.close-btn:hover {
  background-color: #ff6b6b !important;
  border-color: #ff8080 !important;
}

/* 清空屏幕按钮样式 */
.clear-btn {
  background-color: #3a3a3a !important;
  border-color: #444 !important;
  color: #e0e0e0 !important;
}

.clear-btn:hover {
  background-color: #4a4a4a !important;
  border-color: #555 !important;
}

/* 连接信息样式（保持不变） */
.connection-info {
  font-size: 14px;
  font-weight: 500;
}

/* 新增头部样式 */
.terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid #333;
  background: #222;
  height: 40px;
  box-sizing: border-box;
}

.connection-info {
  color: #61dafb;
  font-size: 14px;
}

.terminal-output {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  white-space: pre-wrap;
}

.terminal-input {
  display: flex;
  padding: 10px;
  border-top: 1px solid #333;
  margin-bottom: 30px;
}

.terminal-input input {
  flex: 1;
  background: #333;
  border: none;
  color: #fff;
  padding: 8px;
  outline: none;
  font-family: monospace;
}

/* 禁用状态样式 */
.terminal-input input:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
/* 新增命令预设区域样式 */
.preset-commands {
  padding: 8px 10px;
  border-bottom: 1px solid #333;
  background: #2a2a2a;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

/* 修复：命令按钮样式，确保右键点击区域正常 */
.preset-btn {
  background-color: #3a3a3a !important;
  border-color: #444 !important;
  color: #e0e0e0 !important;
  position: relative !important;
  z-index: 1 !important;
}
/* 右键菜单样式 */
.el-dropdown-menu {
  background-color: #2d2d2d !important;
  border-color: #444 !important;
}

.el-dropdown-item {
  color: #e0e0e0 !important;
}

.el-dropdown-item:hover {
  background-color: #3a3a3a !important;
}

/* 修复：右键菜单核心样式 */
.context-menu-container {
  position: fixed !important;
  z-index: 9999 !important;
  padding: 2px !important;
  background-color: #2d2d2d !important;
  border-radius: 4px !important;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5) !important;
  border: 1px solid #444 !important;
}

.context-menu {
  width: 120px !important;
  background-color: transparent !important;
  border: none !important;
}

/* 菜单项样式 */
.menu-item {
  color: #e0e0e0 !important;
  height: 38px !important;
  line-height: 38px !important;
  padding: 0 16px !important;
  margin: 0 !important;
  border-radius: 2px !important;
}

.menu-item:hover {
  background-color: #3a3a3a !important;
}

/* 删除项样式 */
.delete-item {
  color: #ff4d4f !important;
}

/* 去除菜单默认间距和边框 */
.el-menu--vertical {
  border-right: none !important;
}

.el-menu-item:not(:last-child) {
  border-bottom: 1px solid #383838 !important;
}

/* 确保菜单不被遮挡 */
.el-menu {
  overflow: visible !important;
}

/* 命令按钮样式优化 */
.preset-btn {
  background-color: #3a3a3a !important;
  border-color: #444 !important;
  color: #e0e0e0 !important;
  margin: 2px 0 !important;
}

/* 新增：自动滚动复选框样式 */
.auto-scroll-checkbox {
  color: #e0e0e0 !important;
  margin-right: 8px !important;
  align-self: center !important;
}

.el-checkbox__inner {
  background-color: #3a3a3a !important;
  border-color: #444 !important;
}

.el-checkbox__input.is-checked .el-checkbox__inner {
  background-color: #1890ff !important;
  border-color: #1890ff !important;
}

.el-checkbox__label {
  color: #e0e0e0 !important;
  font-size: 14px !important;
}

/* 新增：显示日志复选框样式 */
.show-log-checkbox {
  color: #e0e0e0 !important;
  margin-right: 8px !important;
  align-self: center !important;
}

.preset-btn.looping {
  animation: pulse 1.5s infinite;
  border-color: #1890ff !important;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(24, 144, 255, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(24, 144, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(24, 144, 255, 0);
  }
}
</style>
