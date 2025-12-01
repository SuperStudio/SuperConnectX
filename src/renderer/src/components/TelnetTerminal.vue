<!-- TelnetTerminal.vue -->
<template>
  <div class="telnet-terminal">
    <!-- 终端输出区域 -->
    <div class="terminal-output" v-html="output"></div>
    <!-- 命令输入区域 -->
    <div class="terminal-input">
      <input
        v-model="currentCommand"
        @keydown.enter="sendCommand"
        placeholder="输入命令并按回车..."
        ref="commandInput"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, ref as vueRef } from 'vue'
import { ElMessage } from 'element-plus'

// 接收父组件传递的连接参数和关闭回调
const props = defineProps<{
  connection: { id: number; host: string; port: number }
  onClose: () => void
}>()

const output = ref('') // 终端输出内容
const currentCommand = ref('') // 当前输入的命令
const commandInput = vueRef<HTMLInputElement>(null) // 输入框引用
let removeDataListener: () => void // 移除数据监听的函数
let removeCloseListener: () => void // 移除关闭监听的函数
let currentConnId = 0 // 当前连接的 ID

// 👇 关键：处理主进程发送的 Telnet 数据
const handleTelnetData = (data: { connId: number; data: string }) => {
  // 只处理当前连接的数据（避免多个终端混淆）
  if (data.connId === currentConnId) {
    // 更新输出内容（替换换行符为 <br>，适配 HTML 显示）
    output.value += data.data.replace(/\r\n/g, '<br>').replace(/\n/g, '<br>')
    // 滚动到最新输出（终端体验）
    scrollToBottom()
  }
}

// 处理连接关闭
const handleTelnetClose = (connId: number) => {
  if (connId === currentConnId) {
    ElMessage.info('连接已关闭')
    output.value += '<br>--- 连接已关闭 ---'
    props.onClose()
  }
}

// 连接 Telnet 服务器（之前的逻辑，补充存储 currentConnId）
const connect = async () => {
  try {
    const cleanConn = {
      id: props.connection.id,
      host: props.connection.host,
      port: props.connection.port
    }
    const result = await window.electronStore.connectTelnet(cleanConn)
    if (result.success) {
      currentConnId = result.connId // 存储当前连接 ID
      output.value = `success connect to ${cleanConn.host}:${cleanConn.port}<br>`
      // 注册数据监听和关闭监听
      removeDataListener = window.electronStore.onTelnetData(handleTelnetData)
      removeCloseListener = window.electronStore.onTelnetClose(handleTelnetClose)
      // 聚焦输入框
      commandInput.value?.focus()
    } else {
      ElMessage.error(result.message)
      props.onClose()
    }
  } catch (error) {
    console.error('连接失败:', error)
    ElMessage.error('连接失败')
    props.onClose()
  }
}

// 发送命令到 Telnet 服务器（补充功能）
const sendCommand = async () => {
  if (!currentCommand.value.trim()) return
  // 先把命令显示在输出区（模拟终端输入回显）
  output.value += `> ${currentCommand.value}<br>`
  try {
    await window.electronStore.telnetSend({
      connId: currentConnId,
      command: currentCommand.value.trim()
    })
  } catch (error) {
    ElMessage.error('命令发送失败')
    console.error('发送失败:', error)
  }
  // 清空输入框并聚焦
  currentCommand.value = ''
  commandInput.value?.focus()
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
  if (removeDataListener) removeDataListener()
  if (removeCloseListener) removeCloseListener()
  if (currentConnId) {
    window.electronStore.telnetDisconnect(currentConnId).catch((err) => {
      console.error('卸载时断开连接失败:', err)
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
  padding: 10px;
  font-family: monospace;
}

.terminal-output {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 10px;
  white-space: pre-wrap;
}

.terminal-input {
  display: flex;
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
</style>
