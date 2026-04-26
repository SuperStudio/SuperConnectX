<template>
  <div class="telnet-terminal">
    <UnifiedTerminal
      ref="unifiedTerminalRef"
      :connection="connection"
      :is-connected="isConnected"
      :is-connecting="isConnecting"
      :init-message="`try to connect ${connection.host}:${connection.port}`"
      placeholder="输入命令并按回车..."
      session-id-prefix="telnet"
      @on-close="handleClose"
      @on-reconnect="handleReconnect"
      @on-open-log="openLogFile"
      @on-save-log="saveLogFile"
      @on-send="handleSend"
      @on-command-sent="handleCommandSent"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, onMounted, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import UnifiedTerminal from './UnifiedTerminal.vue'
import TelnetInfo from '../entity/protocol/TelnetInfo'

const MAX_RETRY_COUNT = 1000
const RETRY_INTERVAL_MS = 3000

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

const isConnected = ref(true)
const isConnecting = ref(false)
let currentConnId = 0
let removeDataListener: (() => void) | null = null
let removeCloseListener: (() => void) | null = null

let retryCount = 0
let retryTimer: NodeJS.Timeout | null = null
let stopRetry = ref(false)
let allRecvSize = 0
let totalTxSize = 0

const unifiedTerminalRef = ref<InstanceType<typeof UnifiedTerminal>>()

// 暴露给父组件的连接状态
const isConnectedValue = computed(() => isConnected.value)

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
  const content = unifiedTerminalRef.value?.getEditorContent() || ''
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
      unifiedTerminalRef.value?.appendToTerminal(`\n连接已手动关闭\n`)
    } catch (error) {
      console.error('关闭连接失败:', error)
      ElMessage.error('关闭连接失败')
    } finally {
      cleanup()
    }
  }
  isConnected.value = false
}

const cleanup = () => {
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
  allRecvSize = 0
  totalTxSize = 0
}

const handleReconnect = () => {
  unifiedTerminalRef.value?.appendToTerminal(`\n正在重新连接...\n`)
  connect()
}

const handleTelnetClose = (connId: number) => {
  if (connId === currentConnId) {
    ElMessage.info('连接已关闭，将尝试重新连接...')
    cleanup()
    unifiedTerminalRef.value?.appendToTerminal(`\n连接已关闭，将在${RETRY_INTERVAL_MS / 1000}秒后尝试重连...\n`)
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
  allRecvSize = 0
  totalTxSize = 0

  let isFirstConnect = true
  const attemptConnect = async () => {
    if (stopRetry.value) {
      isConnecting.value = false
      return
    }

    try {
      const result = await window.connectApi.startConnect({
        ...TelnetInfo.buildWithValue(props.connection),
        sessionId: props.connection.sessionId
      })
      if (result.success) {
        cleanup()

        currentConnId = result.connId
        isConnected.value = true
        isConnecting.value = false

        removeDataListener = window.connectApi.onRecvData((data) => {
          if (data.connId !== currentConnId) return
          allRecvSize += data.data.length
          unifiedTerminalRef.value?.updateRxBytes(data.data.length)
          unifiedTerminalRef.value?.appendToTerminal(`\n${data.data}`)
        })

        removeCloseListener = window.connectApi.onConnectClose(handleTelnetClose)
        unifiedTerminalRef.value?.focusInput()
        unifiedTerminalRef.value?.appendToTerminal(`\nconnect success, retry count: ${retryCount + 1}\n`)
        retryCount = 0
        isFirstConnect = false
      } else {
        throw new Error(result.message || '连接失败')
      }
    } catch (error) {
      retryCount++
      const errMsg = (error as Error).message
      unifiedTerminalRef.value?.appendToTerminal(`\nconnect failed: (${retryCount}/${MAX_RETRY_COUNT}): ${errMsg}\n`)

      if (retryCount < MAX_RETRY_COUNT && !stopRetry.value) {
        retryTimer = setTimeout(attemptConnect, RETRY_INTERVAL_MS)
      } else if (retryCount >= MAX_RETRY_COUNT) {
        isConnecting.value = false
        emit('onClose')
        if (typeof props.onClose === 'function') props.onClose()
      }
    }
  }

  await attemptConnect()
}

const handleSend = async (command: string) => {
  if (!command.trim() || !isConnected.value) return

  unifiedTerminalRef.value?.appendToTerminal(`\n[${new Date().toISOString()}] SEND >>>>>>>>>> ${command}\n`)
  totalTxSize += command.length
  unifiedTerminalRef.value?.updateTxBytes(command.length)

  try {
    await window.connectApi.sendData({
      conn: {
        ...TelnetInfo.buildWithValue(props.connection),
        sessionId: props.connection.sessionId
      },
      command: command.trim()
    })
  } catch (error) {
    ElMessage.error('命令发送失败')
    console.error('发送失败:', error)
  }
}

const handleCommandSent = (cmdName: string) => emit('commandSent', cmdName)

const refreshGroupsCmds = () => unifiedTerminalRef.value?.refreshGroupsCmds?.()

const handleFontChange = (font: string) => {
  unifiedTerminalRef.value?.editor?.updateOptions({ fontFamily: font })
}

const handleFontSizeChange = (action: string) => {
  const editor = unifiedTerminalRef.value?.editor
  if (editor) {
    const currentSize = editor.getOption(monaco.editor.EditorOption.fontSize)
    let newSize = currentSize
    if (action === 'increase') {
      newSize = Math.min(currentSize + 2, 30)
    } else {
      newSize = Math.max(currentSize - 2, 8)
    }
    editor.updateOptions({ fontSize: newSize })
  }
}

const refreshLayout = () => {
  unifiedTerminalRef.value?.editor?.layout()
}

defineExpose({
  refreshGroupsCmds,
  handleFontChange,
  handleFontSizeChange,
  refreshLayout,
  isConnected: isConnectedValue
})

onMounted(() => {
  connect()
})

onUnmounted(() => {
  stopRetry.value = true
  if (retryTimer) {
    clearTimeout(retryTimer)
  }

  cleanup()

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
}
</style>
