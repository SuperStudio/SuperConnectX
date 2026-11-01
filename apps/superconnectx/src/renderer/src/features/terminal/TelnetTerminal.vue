<template>
  <div class="telnet-terminal">
    <UnifiedTerminal
      ref="unifiedTerminalRef"
      :connection="connection"
      :is-connected="isConnected"
      :is-connecting="isConnecting"
      :init-message="initMessage"
      :placeholder="t('terminal.inputPrompt')"
      :show-bottom-panel="showBottomPanel"
      session-id-prefix="telnet"
      :terminal-mode="terminalMode"
      @on-terminal-input="handleTerminalInput"
      @on-terminal-resize="handleTerminalResize"
      @on-close="handleClose"
      @on-reconnect="handleReconnect"
      @on-open-log-folder="openLogFolder"
      @on-open-log-file="openLogFile"
      @on-rotate-log="rotateLogFile"
      @on-send="handleSend"
      @on-command-sent="handleCommandSent"
      @on-file-upload="handleFileUpload"
      @on-open-command-editor="emit('openCommandEditor', connection.connectionType)"
      @on-edit-syntax-rules="emit('openSyntaxHighlight')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
import UnifiedTerminal from './UnifiedTerminal.vue'
import { fromRawConnection } from '../../features/connections/protocol'
import { useTerminal } from './useTerminal'
import { formatReceivedData, recvDisplayText } from './useTerminalDisplayText'

const MAX_RETRY_COUNT = 1000
const RETRY_INTERVAL_MS = 3000

const emit = defineEmits(['onClose', 'commandSent', 'openCommandEditor', 'fontLoaded', 'openSyntaxHighlight', 'terminalModeChanged'])
const props = withDefaults(defineProps<{
  connection: {
    id: string | number
    connectionType: string
    host?: string
    port?: number
    name?: string
    sessionId: string | number
    ftpMode?: string
    encoding?: string
  }
  onClose?: () => void
  autoConnect?: boolean
  showBottomPanel?: boolean
}>(), {
  autoConnect: true,
  showBottomPanel: true
})

const isConnected = ref(false)

// 会话恢复且未自动连接时，不显示 "try to connect"，改为等待连接提示
const initMessage = computed(() => {
  if (!props.autoConnect) {
    return t('telnetTerminal.waiting', { host: props.connection.host, port: props.connection.port })
  }
  return props.connection.ftpMode === 'server'
    ? `create server ${props.connection.port}`
    : `try to connect ${props.connection.host}:${props.connection.port}`
})

const isConnecting = ref(false)
const unifiedTerminalRef = ref<InstanceType<typeof UnifiedTerminal>>()

/**
 * 终端模式（per-connection 偏好）：true 时输出区为 xterm 真终端。
 * SSH 默认开启，其余协议默认关闭；可由「视图」菜单热切换并持久化。
 */
const terminalMode = ref(false)

let retryCount = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
const stopRetry = ref(false)
let preventAutoReconnect = false
let removeDataListener: (() => void) | null = null
let removeCloseListener: (() => void) | null = null
let connectGeneration = 0
let connectAttemptQueue = Promise.resolve()

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
        if (conn.showTimestamp !== undefined) {
          terminal.showTimestamp.value = conn.showTimestamp
          unifiedTerminalRef.value?.setShowTimestamp?.(conn.showTimestamp)
        }
        // 终端模式偏好：未配置时按协议默认（SSH 默认进终端模式）
        const storedMode = conn.terminalMode
        applyTerminalMode(
          storedMode === undefined ? props.connection.connectionType === 'ssh' : storedMode === true
        )
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
        fontFamily: terminal.fontFamily.value,
        showTimestamp: terminal.showTimestamp.value
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
  // telnet / ftp / ssh 共用本终端外壳：ftp 维持原 payload 语义不变，ssh 必须用真实类型，
  // 否则 IPC 会带着 'telnet' 路由，主进程不会走 SshClient。
  connectionType: (props.connection.connectionType === 'ssh' ? 'ssh' : 'telnet') as 'telnet' | 'ssh',
  sendDisplaySuffix: 'SEND >>>>>>>>>>>',
  saveFontSettings
})

const { openLogFolder, openLogFile, saveLogFileAs, rotateLogFile, cleanup: terminalCleanup } = terminal

/**
 * 应用终端模式到界面。
 * 注意：真正持久化由 saveTerminalModePreference 完成，这里只负责 UI 状态。
 */
const applyTerminalMode = (enabled: boolean): void => {
  terminalMode.value = enabled
  unifiedTerminalRef.value?.setTerminalMode?.(enabled)
  // 同步给上层：「视图」菜单要据此回显勾选状态（偏好是异步读出的，必须上报）
  emit('terminalModeChanged', enabled)
}

/** 将当前的终端模式偏好写入该连接的存储，实现 per-connection 记忆 */
const saveTerminalModePreference = async (enabled: boolean): Promise<void> => {
  const originalId = getOriginalConnectionId()
  if (!originalId) {
    // 尚未保存过的新连接无法定位 id，仅切换 UI 不报错
    return
  }
  try {
    await window.storageApi.updateConnection({ id: originalId, terminalMode: enabled })
  } catch (error) {
    console.error('Failed to save terminal mode preference:', error)
  }
}

/**
 * 读取 per-connection 的终端模式偏好。
 * 连线前就要知道结果，否则先渲染日志视图再切换到 xterm 会出现闪烁。
 */
const loadTerminalModePreference = async (): Promise<void> => {
  const originalId = getOriginalConnectionId()
  if (!originalId) {
    // 新建连接尚未落盘：仅按协议默认（SSH 进终端模式）
    applyTerminalMode(props.connection.connectionType === 'ssh')
    return
  }
  try {
    const connections = await window.storageApi.getConnections()
    const conn = connections.find((c: any) => c.id === originalId)
    const stored = conn?.terminalMode
    applyTerminalMode(
      stored === undefined ? props.connection.connectionType === 'ssh' : stored === true
    )
  } catch (error) {
    console.error('Failed to load terminal mode preference:', error)
    applyTerminalMode(props.connection.connectionType === 'ssh')
  }
}

/** 菜单/外部入口：切换终端模式（热切换 + 持久化） */
const setTerminalMode = async (enabled: boolean): Promise<void> => {
  applyTerminalMode(enabled)
  await saveTerminalModePreference(enabled)
}

/** 当前连线参数（用于 raw 发送与尺寸同步） */
const getConnectionPayload = (): any => {
  const connObj = JSON.parse(
    JSON.stringify({
      ...fromRawConnection(props.connection),
      sessionId: props.connection.sessionId,
      password: undefined
    })
  )
  return connObj
}

/** 终端模式：xterm 按键上送的字节流必须以 raw 方式发送，否则 Ctrl+C 会被追加 \n 破坏语义 */
const handleTerminalInput = async (payload: string) => {
  if (!isConnected.value) return
  try {
    await window.connectApi.sendData({ conn: getConnectionPayload(), command: payload, options: { raw: true } })
    terminal.totalTxSize += payload.length
    unifiedTerminalRef.value?.updateTxBytes(payload.length)
  } catch (error) {
    console.error('Failed to send terminal input:', error)
  }
}

/** 终端模式：把可视行列同步给远端 PTY，让 vim/top 等程序随窗口重排 */
const handleTerminalResize = async (rows: number, cols: number) => {
  if (!isConnected.value || !terminalMode.value) return
  try {
    await window.connectApi.resizeTerminal({ conn: getConnectionPayload(), rows, cols })
  } catch (error) {
    // 尺寸同步失败不影响正常使用，静默即可
    console.error('Failed to sync terminal size:', error)
  }
}

const clearRetryTimer = () => {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

const getStopConnectionPayload = () => {
  const stopConn: any = {
    connectionType: props.connection.connectionType,
    sessionId: props.connection.sessionId
  }
  if (props.connection.connectionType === 'telnet' || props.connection.connectionType === 'ssh') {
    stopConn.host = props.connection.host
    stopConn.port = props.connection.port
  }
  return stopConn
}

// This primitive must stay queue-free because it is also used from a queued start task.
const stopConnectionDirect = async () => {
  await window.connectApi.stopConnect(getStopConnectionPayload())
}

const enqueueConnectionTask = (task: () => Promise<void>) => {
  const queuedTask = connectAttemptQueue.catch(() => undefined).then(task)
  connectAttemptQueue = queuedTask
  return queuedTask
}

const stopConnection = async () => {
  // Cancel a pending backend start immediately, then wait for its renderer task
  // to observe the generation change before a later generation can start.
  await stopConnectionDirect()
  await connectAttemptQueue.catch(() => undefined)
}

const cancelConnectLifecycle = () => {
  connectGeneration++
  stopRetry.value = true
  clearRetryTimer()
  isConnecting.value = false
}

const handleClose = async () => {
  preventAutoReconnect = true
  cancelConnectLifecycle()
  // 先清理监听器，防止 onConnectClose 回调触发重连提示
  cleanup()
  unifiedTerminalRef.value?.appendToTerminal(`\n连接已关闭\n`)
  try {
    await stopConnection()
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

const handleReconnect = async () => {
  const shouldStopConnection = isConnected.value
  cancelConnectLifecycle()
  const reconnectGeneration = connectGeneration
  cleanup()
  preventAutoReconnect = false
  stopRetry.value = false
  terminal.totalTxSize = 0
  terminal.totalRxSize = 0
  unifiedTerminalRef.value?.resetRxTx()
  unifiedTerminalRef.value?.appendToTerminal(`\n正在重新连接...\n`)
  if (shouldStopConnection) {
    try {
      await stopConnection()
    } catch (error) {
      console.error('Failed to stop connection before reconnecting:', error)
    }
  }
  if (reconnectGeneration !== connectGeneration || preventAutoReconnect) return
  connect()
}

const reconnect = () => handleReconnect()

const scheduleRetry = (callback: () => void, delay: number, generation: number) => {
  clearRetryTimer()
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (generation !== connectGeneration || stopRetry.value || preventAutoReconnect) return
    callback()
  }, delay)
}

const handleTelnetClose = (_sessionId: string | number, generation: number) => {
  if (generation !== connectGeneration) return
  connectGeneration++
  const reconnectGeneration = connectGeneration
  clearRetryTimer()
  isConnecting.value = false
  cleanup()
  if (preventAutoReconnect) {
    unifiedTerminalRef.value?.appendToTerminal(`\n连接已关闭\n`)
    return
  }
  // FTP server 模式不应该自动重连（server 停止即结束，不应重建）
  if (props.connection.connectionType === 'ftp' && props.connection.ftpMode === 'server') {
    unifiedTerminalRef.value?.appendToTerminal(`\nFTP 服务已停止\n`)
    return
  }
  ElMessage.info(t('terminal.reconnecting'))
  unifiedTerminalRef.value?.appendToTerminal(`\n连接已关闭，将在${RETRY_INTERVAL_MS / 1000}秒后尝试重连...\n`)
  if (!stopRetry.value) {
    scheduleRetry(connect, RETRY_INTERVAL_MS, reconnectGeneration)
  }
}

const registerConnectionListeners = (generation: number) => {
  removeDataListener?.()
  removeCloseListener?.()

  const sessionId = String(props.connection.sessionId)
  removeDataListener = window.connectApi.onRecvData((data) => {
    if (generation !== connectGeneration || String(data.connId) !== sessionId) return
    terminal.totalRxSize += data.data.length
    unifiedTerminalRef.value?.updateRxBytes(data.data.length)
    // 终端模式下必须由 xterm 自行解析 ANSI（光标移动/清屏），
    // 不能套用日志视图的时间戳与标签加工，否则控制序列会被污染。
    if (terminalMode.value) {
      unifiedTerminalRef.value?.writeToTerminal?.(data.data)
      return
    }
    const recvLabel = recvDisplayText.value ? `${recvDisplayText.value} ` : ''
    const displayText = formatReceivedData(`${recvLabel}${data.data}`, terminal.showTimestamp.value, data.timestamp)
    unifiedTerminalRef.value?.appendToTerminal(displayText)
  })

  removeCloseListener = window.connectApi.onConnectClose((closedSessionId) => {
    if (String(closedSessionId) !== sessionId) return
    handleTelnetClose(closedSessionId, generation)
  })
}

const connect = async () => {
  if (preventAutoReconnect) {
    return
  }
  clearRetryTimer()
  const generation = ++connectGeneration
  stopRetry.value = false
  retryCount = 0
  isConnected.value = false
  isConnecting.value = true
  terminal.totalRxSize = 0
  terminal.totalTxSize = 0

  const attemptConnect = async () => {
    if (generation !== connectGeneration || stopRetry.value || preventAutoReconnect) {
      if (generation === connectGeneration) isConnecting.value = false
      return
    }

    // A retry may have been superseded while it was waiting in the timer queue.
    clearRetryTimer()

    try {
      // 通过 connectionId 发起连接，后端从存储中解密密码
      // 前端不接触明文密码
      const connId = (props.connection as any).connectionId || props.connection.id
      const result = await window.connectApi.startConnectById(
        connId,
        String(props.connection.sessionId),
        // 传递运行时字段（不包含密码，密码由后端从存储中解密）
        JSON.parse(JSON.stringify({
          ...fromRawConnection(props.connection),
          // 连接建立前就带上日志时间戳开关，避免首批数据落盘时未应用 GUI 状态
          logTimestamp: terminal.showTimestamp.value,
          // 终端模式下把可视行列交给主进程，使 PTY 初始尺寸即为真实大小
          ...(terminalMode.value ? unifiedTerminalRef.value?.getTerminalDimensions?.() ?? {} : {}),
          // 清除可能存在的掩码密码，避免覆盖后端解密结果
          password: undefined
        }))
      )

      if (generation !== connectGeneration || stopRetry.value || preventAutoReconnect) {
        if (result.success) {
          try {
            await stopConnectionDirect()
          } catch (error) {
            console.error('Failed to clean up stale connection:', error)
          }
        }
        return
      }

      if (result.success) {
        isConnected.value = true
        isConnecting.value = false

        loadFontSettings()
        const connType = props.connection.connectionType
        const updateConn: any = {
          connectionType: connType,
          sessionId: props.connection.sessionId
        }
        if (connType === 'telnet' || connType === 'ssh') {
          updateConn.host = props.connection.host
          updateConn.port = props.connection.port
        }
        window.connectApi.updateConnect(
          updateConn,
          { logTimestamp: terminal.showTimestamp.value }
        )

        // 终端模式：连接就绪后把当前可视行列同步给远端 PTY
        if (terminalMode.value) {
          const dims = unifiedTerminalRef.value?.getTerminalDimensions?.()
          if (dims && dims.rows > 0 && dims.cols > 0) {
            await handleTerminalResize(dims.rows, dims.cols)
          }
        }


        const successMsg = props.connection.ftpMode === 'server'
          ? `\nserver started, retry count: ${retryCount + 1}\n`
          : `\nconnect success, retry count: ${retryCount + 1}\n`
        unifiedTerminalRef.value?.appendToTerminal(successMsg)
        retryCount = 0
      } else {
        throw new Error(result.message || '连接失败')
      }
    } catch (error) {
      if (generation !== connectGeneration || stopRetry.value || preventAutoReconnect) return
      retryCount++
      const errMsg = (error as Error).message
      unifiedTerminalRef.value?.appendToTerminal(`\nconnect failed: (${retryCount}/${MAX_RETRY_COUNT}): ${errMsg}\n`)
      if (retryCount < MAX_RETRY_COUNT && !stopRetry.value) {
        scheduleRetry(runAttempt, RETRY_INTERVAL_MS, generation)
      } else if (retryCount >= MAX_RETRY_COUNT) {
        isConnecting.value = false
        // Do not leave the failed generation's callbacks registered indefinitely.
        cleanup()
        emit('onClose')
        if (typeof props.onClose === 'function') props.onClose()
      }
    }
  }

  const runAttempt = async () => {
    // A stale successful start must finish stopping before a newer generation
    // starts with the same sessionId, otherwise its cleanup could stop the new one.
    await enqueueConnectionTask(async () => {
      if (generation !== connectGeneration || stopRetry.value || preventAutoReconnect) return
      // Register only after the previous generation has cleaned itself up, but
      // before this generation starts, so neither stale close nor early data wins.
      registerConnectionListeners(generation)
      await attemptConnect()
    })
  }

  await runAttempt()
}

const handleSend = async (command: string, _originalInput?: string) => {
  if (!command.trim() || !isConnected.value) return

  terminal.totalTxSize += command.length
  unifiedTerminalRef.value?.updateTxBytes(command.length)

  try {
    // JSON 序列化确保传入 IPC 的是纯数据对象，避免 Vue reactive proxy 导致 clone 错误
    const connObj = JSON.parse(JSON.stringify({
      ...fromRawConnection(props.connection),
      sessionId: props.connection.sessionId
    }))
    await window.connectApi.sendData({
      conn: connObj,
      command: command.trim()
    })
  } catch (error) {
    ElMessage.error(t('terminal.commandSendFailed'))
    console.error('Failed to send:', error)
  }
}

const handleFileUpload = (filePath: string, fileName: string) => {
  if (!isConnected.value) {
    ElMessage.warning(t('terminal.notConnected'))
    return
  }

  unifiedTerminalRef.value?.appendToTerminal(`\n[FTP] Uploading: ${fileName}\n`)

  // fire-and-forget：主进程异步读取文件并上传，进度通过 onRecvData 实时推送
  ;(async () => {
    try {
      const connObj = JSON.parse(JSON.stringify({
        ...fromRawConnection(props.connection),
        sessionId: props.connection.sessionId
      }))

      const result = await window.connectApi.uploadFile({
        conn: connObj,
        localFilePath: filePath,
        remoteFileName: fileName
      })

      if (result.success) {
        ElMessage.success(t('terminal.fileUploadSuccess', { name: fileName }))
      } else {
        ElMessage.error(t('terminal.uploadFailed', { message: result.message }))
      }
    } catch (error) {
      ElMessage.error(t('terminal.fileUploadFailed'))
      console.error('Failed to upload file:', error)
    }
  })()
}

const handleCommandSent = (cmdName: string) => emit('commandSent', cmdName)

const refreshGroupsCmds = () => unifiedTerminalRef.value?.refreshGroupsCmds?.()

const handleFontChange = (font: string) => terminal.handleFontChange(font)

defineExpose({
  refreshGroupsCmds,
  handleFontChange,
  isConnected: computed(() => isConnected.value),
  isConnecting: computed(() => isConnecting.value),
  disconnect: handleClose,
  reconnect,
  cleanup: () => {
    preventAutoReconnect = true
    cancelConnectLifecycle()
    cleanup()
  },
  preventAutoReconnect: () => {
    preventAutoReconnect = true
    cancelConnectLifecycle()
  },
  getFontFamily: () => {
    const unifiedFont = unifiedTerminalRef.value?.getFontFamily?.()
    return unifiedFont || terminal.fontFamily.value
  },
  clearTerminal: () => unifiedTerminalRef.value?.clearTerminal?.(),
  setWordWrap: (val: boolean) => unifiedTerminalRef.value?.setWordWrap?.(val),
  setLineNumbers: (val: boolean) => unifiedTerminalRef.value?.setLineNumbers?.(val),
  setLogEditable: (val: boolean) => unifiedTerminalRef.value?.setLogEditable?.(val),
  setTerminalMode,
  getTerminalMode: () => terminalMode.value,
  saveLogFileAs
})

onBeforeUnmount(() => {
  // 组件销毁时确保一切清理干净：停止重试、移除监听器
  preventAutoReconnect = true
  cancelConnectLifecycle()
  cleanup()
  stopConnection().catch((error) => {
    console.error('Failed to disconnect on unmount:', error)
  })
})

onMounted(() => {
  // 连线前先应用终端模式偏好（SSH 默认进入终端模式），
  // 避免 xterm 挂载过晚导致首屏仍是日志视图、用户看到闪烁切换。
  loadTerminalModePreference()
  if (props.autoConnect) {
    connect()
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
  background: var(--bg-primary);
  color: var(--text-white);
  font-family: 'Fira Code', 'Consolas', 'Ubuntu Mono', 'Noto Sans Mono CJK SC', monospace;
  border-radius: 0px;
  overflow: hidden;
}
</style>
