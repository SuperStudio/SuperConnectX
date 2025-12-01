<!-- TelnetTerminal.vue -->
<template>
  <div class="telnet-terminal">
    <!-- 新增关闭按钮 -->
    <div class="terminal-header">
      <span class="connection-info"> {{ connection.host }}:{{ connection.port }} </span>
      <el-button
        type="text"
        icon="Document"
        class="log-btn"
        @click="openLogFile"
        :disabled="!isConnected"
      >
        打开日志
      </el-button>
      <el-button type="text" icon="Close" class="close-btn" @click="handleClose">
        关闭连接
      </el-button>
    </div>

    <!-- 终端输出区域 -->
    <div class="terminal-output" v-html="output"></div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, ref as vueRef } from 'vue'
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
    output.value += data.data.replace(/\r\n/g, '<br>').replace(/\n/g, '<br>')
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
  const outputElement = document.querySelector('.terminal-output')
  if (outputElement) {
    outputElement.scrollTop = outputElement.scrollHeight
  }
}

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
  // 强制断开连接
  if (currentConnId && isConnected.value) {
    window.electronStore.telnetDisconnect(currentConnId).catch((err) => {
      console.error('卸载时断开失败:', err)
    })
  }
})

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

.close-btn {
  color: #ff4d4f !important;
  padding: 4px 8px !important;
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
</style>
