import { ref, watch, onUnmounted, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { getDefaultTerminalFont } from '../../utils/FontDetector'
import { sendDisplayText as sendDisplayTextStore } from '../../composables/app/useSettingsStore'

/** A SuperConnectX connection opened by a terminal session. */
export interface TerminalConnection {
  id: string | number
  connectionType: string
  sessionId: string | number
  comName?: string
  host?: string
  port?: number
  name?: string
  [key: string]: any
}

export interface UseTerminalOptions {
  /** UnifiedTerminal ref */
  unifiedTerminalRef: Ref<any>
  /** 是否已连接 */
  isConnected: Ref<boolean>
  /** 是否正在连接 */
  isConnecting?: Ref<boolean>
  /** 连接类型 */
  connectionType: 'telnet' | 'com'
  /** 连接对象 */
  connection: TerminalConnection
  /** 发送命令回调 */
  onSend?: (command: string, originalInput?: string) => void
  /** 字体设置保存器（可选） */
  saveFontSettings?: () => Promise<void>
  /** 发送命令时显示的内容（可选，默认显示时间戳+suffix） */
  sendDisplaySuffix?: string
}

export interface UseTerminalReturn {
  fontSize: Ref<number>
  fontFamily: Ref<string>
  showTimestamp: Ref<boolean>
  totalRxSize: number
  totalTxSize: number
  openLogFolder: () => Promise<void>
  openLogFile: () => Promise<void>
  saveLogFile: () => Promise<void>
  handleClose: () => Promise<void>
  handleSend: (command: string, originalInput?: string) => Promise<void>
  reconnect: () => void
  handleFontChange: (font: string) => void
  cleanup: () => void
  defineExpose: () => {
    handleFontChange: (font: string) => void
    getFontFamily: () => string
    getShowTimestamp: () => boolean
  }
}

/**
 * Coordinates a SuperConnectX terminal session. It intentionally stays in the
 * terminal feature because it depends on connection-session IPC and product
 * terminal settings, neither of which belongs in renderer foundation.
 */
export function useTerminal(options: UseTerminalOptions): UseTerminalReturn {
  const {
    unifiedTerminalRef,
    isConnected,
    isConnecting: _isConnecting,
    onSend,
    saveFontSettings,
    sendDisplaySuffix = 'SEND >>>>>>>>>>>',
    connectionType
  } = options

  const { t } = useI18n()
  const conn = options.connection
  const fontSize = ref(14)
  const fontFamily = ref(getDefaultTerminalFont())
  const showTimestamp = ref(true)
  let totalRxSize = 0
  let totalTxSize = 0
  let removeDataListener: (() => void) | null = null
  let removeCloseListener: (() => void) | null = null
  let watchInitialized = false

  const getConnectionIpcPayload = () => {
    // IPC must receive plain data rather than Vue reactive proxies.
    const rawConn = JSON.parse(JSON.stringify(conn))
    return connectionType === 'telnet'
      ? { connectionType: 'telnet' as const, host: rawConn.host, port: rawConn.port, sessionId: rawConn.sessionId }
      : { connectionType: 'com' as const, comName: rawConn.comName, sessionId: rawConn.sessionId }
  }

  watch([
    () => unifiedTerminalRef.value?.getShowTimestamp?.(),
    () => unifiedTerminalRef.value?.getFontSize?.(),
    () => unifiedTerminalRef.value?.getFontFamily?.()
  ], ([newTimestamp, newFontSize, newFontFamily]) => {
    if (!unifiedTerminalRef.value) return
    watchInitialized = true

    if (newTimestamp !== undefined && newTimestamp !== showTimestamp.value) {
      showTimestamp.value = newTimestamp
      notifyLogTimestampToBackend(newTimestamp)
    }
    if (newFontSize !== undefined && newFontSize !== fontSize.value) fontSize.value = newFontSize
    if (newFontFamily !== undefined && newFontFamily !== fontFamily.value) fontFamily.value = newFontFamily
  })

  watch([showTimestamp, fontSize, fontFamily], () => {
    if (watchInitialized) saveFontSettings?.()
  })

  const notifyLogTimestampToBackend = async (showTs: boolean) => {
    if (!isConnected.value) return
    try {
      await window.connectApi.updateConnect(getConnectionIpcPayload(), { logTimestamp: showTs })
    } catch (error) {
      console.error('Failed to update log timestamp config:', error)
    }
  }

  const openLogFolder = async () => {
    try {
      const result = await window.connectApi.openConnectLog(String(conn.sessionId), 'folder')
      if (!result.success) ElMessage.error(t('terminal.openLogFolderFailed', { message: result.message }))
    } catch (error) {
      ElMessage.error(t('terminal.openLogFolderFailedWithError', { error: error instanceof Error ? error.message : t('terminal.unknownError') }))
    }
  }

  const openLogFile = async () => {
    try {
      const result = await window.connectApi.openConnectLog(String(conn.sessionId), 'file')
      if (!result.success) ElMessage.error(t('terminal.openLogFileFailed', { message: result.message }))
    } catch (error) {
      ElMessage.error(t('terminal.openLogFileFailedWithError', { error: error instanceof Error ? error.message : t('terminal.unknownError') }))
    }
  }

  const saveLogFile = async () => {
    try {
      const result = await window.connectApi.rotateLogFile(String(conn.sessionId))
      if (result.success) {
        ElMessage.success(t('terminal.logRotateSuccess', { oldName: result.oldFileName, newName: result.newFileName }))
      } else {
        ElMessage.error(t('terminal.saveFailed', { message: result.message || t('terminal.unknownError') }))
      }
    } catch (error) {
      ElMessage.error(t('terminal.saveFailedWithError', { error: error instanceof Error ? error.message : t('terminal.unknownError') }))
    }
  }

  const cleanup = () => {
    removeDataListener?.()
    removeDataListener = null
    removeCloseListener?.()
    removeCloseListener = null
    totalRxSize = 0
    totalTxSize = 0
  }

  const handleClose = async () => {
    cleanup()
    try {
      await window.connectApi.stopConnect(getConnectionIpcPayload())
      unifiedTerminalRef.value?.appendToTerminal('\n连接已关闭\n')
    } catch (error) {
      console.error('Failed to close connection:', error)
    }
    isConnected.value = false
  }

  const handleSend = async (command: string, originalInput?: string) => {
    if (!command.trim() || !isConnected.value) return

    const now = new Date()
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`
    const displaySuffix = sendDisplayTextStore.value || sendDisplaySuffix
    unifiedTerminalRef.value?.appendToTerminal(`\n[${timestamp}] ${displaySuffix} ${command}\n`)
    totalTxSize += command.length
    unifiedTerminalRef.value?.updateTxBytes(command.length)

    if (onSend) {
      onSend(command, originalInput)
      return
    }

    try {
      await window.connectApi.sendData({ conn: getConnectionIpcPayload(), command: command.trim() })
    } catch (error) {
      ElMessage.error(t('terminal.commandSendFailed'))
      console.error('Failed to send:', error)
    }
  }

  const reconnect = () => {
    // Protocol-specific terminal components implement reconnection.
  }

  const handleFontChange = (font: string) => {
    fontFamily.value = font
    unifiedTerminalRef.value?.setFontFamily?.(font)
    saveFontSettings?.()
  }

  const defineExpose = () => ({
    handleFontChange,
    getFontFamily: () => unifiedTerminalRef.value?.getFontFamily?.() || fontFamily.value,
    getShowTimestamp: () => showTimestamp.value
  })

  onUnmounted(() => {
    cleanup()
    if (isConnected.value) {
      window.connectApi.stopConnect(getConnectionIpcPayload()).catch((err: Error) => {
        console.error('Failed to disconnect on unmount:', err)
      })
    }
  })

  return {
    fontSize,
    fontFamily,
    showTimestamp,
    totalRxSize,
    totalTxSize,
    openLogFolder,
    openLogFile,
    saveLogFile,
    handleClose,
    handleSend,
    reconnect,
    handleFontChange,
    cleanup,
    defineExpose
  }
}
