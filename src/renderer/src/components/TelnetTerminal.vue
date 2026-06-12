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
      @on-open-log-folder="openLogFolder"
      @on-open-log-file="openLogFile"
      @on-save-log="saveLogFile"
      @on-send="handleSend"
      @on-command-sent="handleCommandSent"
      @on-open-command-editor="emit('openCommandEditor', connection.connectionType)"
      @on-edit-syntax-rules="emit('openSyntaxHighlight')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import UnifiedTerminal from './UnifiedTerminal.vue'
import { fromRawConnection } from '../entity/protocol'
import { useTerminal } from '../composables/useTerminal'

const MAX_RETRY_COUNT = 1000
const RETRY_INTERVAL_MS = 3000

const emit = defineEmits(['onClose', 'commandSent', 'openCommandEditor', 'fontLoaded', 'openSyntaxHighlight'])
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

const isConnected = ref(false)
const isConnecting = ref(false)
const unifiedTerminalRef = ref<InstanceType<typeof UnifiedTerminal>>()

let retryCount = 0
let retryTimer: NodeJS.Timeout | null = null
let stopRetry = ref(false)
let preventAutoReconnect = false
let removeDataListener: (() => void) | null = null
let removeCloseListener: (() => void) | null = null

// 获取原始 connection id
const getOriginalConnectionId = (): number | undefined => {
  const id = props.connection.id
  if (!id) return undefined
  const parts = id.toString().split('-')
  return parts.length >= 1 ? parseInt(parts[0], 10) : undefined
}

// 加载字体设置
const loadFontSettings = async () => {
  try {
    const originalId = getOriginalConnectionId()
    if (originalId) {
      const connections = await window.storageApi.getConnections()
      const conn = connections.find((c: any) => c.id === originalId)
      if (conn) {
        if (conn.fontSize !== undefined) {
          terminal.fontSize.value = conn.fontSize
          unifiedTerminalRef.value?.setFontSize?.(conn.fontSize)
        }
        if (conn.fontFamily !== undefined) {
          terminal.fontFamily.value = conn.fontFamily
          unifiedTerminalRef.value?.setFontFamily?.(conn.fontFamily)
          emit('fontLoaded', conn.fontFamily)
        }
      }
    }
  } catch (error) {
    console.error('Failed to load font settings:', error)
  }
}

// 保存字体设置
const saveFontSettings = async () => {
  try {
    const originalId = getOriginalConnectionId()
    if (originalId) {
      await window.storageApi.updateConnection({
        id: originalId,
        fontSize: terminal.fontSize.value,
        fontFamily: terminal.fontFamily.value
      })
    }
  } catch (error) {
    console.error('Failed to save font settings:', error)
  }
}

// 使用 composable
const terminal = useTerminal({
  connection: props.connection,
  unifiedTerminalRef,
  isConnected,
  isConnecting,
  connectionType: 'telnet',
  sendDisplaySuffix: 'SEND >>>>>>>>>>>',
  saveFontSettings
})

const { openLogFolder, openLogFile, saveLogFile, cleanup: terminalCleanup } = terminal

const handleClose = async () => {
  stopRetry.value = true
  preventAutoReconnect = true
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  // 先清理监听器，防止 onConnectClose 回调触发重连提示
  cleanup()
  unifiedTerminalRef.value?.appendToTerminal(`\n连接已关闭\n`)
  try {
    await window.connectApi.stopConnect({
      connectionType: 'telnet',
      host: props.connection.host,
      port: props.connection.port,
      sessionId: props.connection.sessionId
    })
  } catch (error) {
    console.error('Failed to close connection:', error)
  }
  isConnected.value = false
}

const cleanup = () => {
  terminalCleanup()
  if (removeDataListener) {
    removeDataListener()
    removeDataListener = null
  }
  if (removeCloseListener) {
    removeCloseListener()
    removeCloseListener = null
  }
  isConnected.value = false
}

const handleReconnect = () => {
  stopRetry.value = false
  terminal.totalTxSize = 0
  terminal.totalRxSize = 0
  unifiedTerminalRef.value?.resetRxTx()
  unifiedTerminalRef.value?.appendToTerminal(`\n正在重新连接...\n`)
  connect()
}

const reconnect = () => handleReconnect()

const handleTelnetClose = (_connId: number) => {
  cleanup()
  if (preventAutoReconnect) {
    unifiedTerminalRef.value?.appendToTerminal(`\n连接已关闭\n`)
    return
  }
  ElMessage.info('连接已关闭，将尝试重新连接...')
  unifiedTerminalRef.value?.appendToTerminal(`\n连接已关闭，将在${RETRY_INTERVAL_MS / 1000}秒后尝试重连...\n`)
  if (!stopRetry.value) {
    setTimeout(connect, 1000)
  }
}

let currentConnId = 0

const connect = async () => {
  stopRetry.value = false
  retryCount = 0
  isConnected.value = false
  isConnecting.value = true
  currentConnId = 0
  terminal.totalRxSize = 0
  terminal.totalTxSize = 0

  const attemptConnect = async () => {
    if (stopRetry.value) {
      isConnecting.value = false
      return
    }

    try {
      const result = await window.connectApi.startConnect({
        ...fromRawConnection(props.connection),
        sessionId: props.connection.sessionId
      })
      if (result.success) {
        terminalCleanup()
        currentConnId = result.connId
        isConnected.value = true
        isConnecting.value = false

        loadFontSettings()
        window.connectApi.updateConnect(
          { connectionType: 'telnet', host: props.connection.host, port: props.connection.port, sessionId: props.connection.sessionId },
          { logTimestamp: terminal.showTimestamp.value }
        )

        // 清理旧监听器，防止重复注册
        if (removeDataListener) {
          removeDataListener()
          removeDataListener = null
        }
        if (removeCloseListener) {
          removeCloseListener()
          removeCloseListener = null
        }

        removeDataListener = window.connectApi.onRecvData((data) => {
          if (data.connId !== currentConnId) return
          terminal.totalRxSize += data.data.length
          unifiedTerminalRef.value?.updateRxBytes(data.data.length)
          const prefix = terminal.showTimestamp.value && data.timestamp ? `[${data.timestamp}] ` : ''
          const displayText = `${prefix}${data.data}\n`
          unifiedTerminalRef.value?.appendToTerminal(displayText)
        })

        removeCloseListener = window.connectApi.onConnectClose((connId) => {
          // 只处理自己连接的断开事件
          if (String(connId) !== String(props.connection.sessionId)) return
          handleTelnetClose(connId)
        })
        unifiedTerminalRef.value?.appendToTerminal(`\nconnect success, retry count: ${retryCount + 1}\n`)
        retryCount = 0
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

const handleSend = async (command: string, _originalInput?: string) => {
  if (!command.trim() || !isConnected.value) return

  terminal.totalTxSize += command.length
  unifiedTerminalRef.value?.updateTxBytes(command.length)

  try {
    await window.connectApi.sendData({
      conn: {
        ...fromRawConnection(props.connection),
        sessionId: props.connection.sessionId
      },
      command: command.trim()
    })
  } catch (error) {
    ElMessage.error('命令发送失败')
    console.error('Failed to send:', error)
  }
}

const handleCommandSent = (cmdName: string) => emit('commandSent', cmdName)

const refreshGroupsCmds = () => unifiedTerminalRef.value?.refreshGroupsCmds?.()

const handleFontChange = (font: string) => terminal.handleFontChange(font)

defineExpose({
  refreshGroupsCmds,
  handleFontChange,
  isConnected: computed(() => isConnected.value),
  disconnect: handleClose,
  reconnect,
  preventAutoReconnect: () => { preventAutoReconnect = true },
  getFontFamily: () => {
    const unifiedFont = unifiedTerminalRef.value?.getFontFamily?.()
    return unifiedFont || terminal.fontFamily.value
  },
  clearTerminal: () => unifiedTerminalRef.value?.clearTerminal?.(),
  setWordWrap: (val: boolean) => unifiedTerminalRef.value?.setWordWrap?.(val),
  setLineNumbers: (val: boolean) => unifiedTerminalRef.value?.setLineNumbers?.(val),
  setLogEditable: (val: boolean) => unifiedTerminalRef.value?.setLogEditable?.(val)
})

onMounted(() => {
  connect()
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
