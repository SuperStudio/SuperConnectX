import { ref, watch, onUnmounted, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

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
  // 状态
  fontSize: Ref<number>
  fontFamily: Ref<string>
  showTimestamp: Ref<boolean>
  totalRxSize: number
  totalTxSize: number

  // 方法
  openLogFolder: () => Promise<void>
  openLogFile: () => Promise<void>
  saveLogFile: () => Promise<void>
  handleClose: () => Promise<void>
  handleSend: (command: string, originalInput?: string) => Promise<void>
  reconnect: () => void
  handleFontChange: (font: string) => void
  cleanup: () => void

  // 暴露
  defineExpose: () => {
    handleFontChange: (font: string) => void
    getFontFamily: () => string
    getShowTimestamp: () => boolean
  }
}

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

  // 状态
  const fontSize = ref(14)
  const fontFamily = ref('Fira Code')
  const showTimestamp = ref(true)
  let totalRxSize = 0
  let totalTxSize = 0

  // 监听器清理
  let removeDataListener: (() => void) | null = null
  let removeCloseListener: (() => void) | null = null

  // 监听 UnifiedTerminal 的状态变化（延迟初始化，等待 unifiedTerminalRef 就绪）
  let watchInitialized = false
  watch([
    () => unifiedTerminalRef.value?.getShowTimestamp?.(),
    () => unifiedTerminalRef.value?.getFontSize?.(),
    () => unifiedTerminalRef.value?.getFontFamily?.()
  ], ([newTimestamp, newFontSize, newFontFamily], _oldValues) => {
    // 等待 unifiedTerminalRef 就绪
    if (!unifiedTerminalRef.value) return

    if (!watchInitialized) {
      watchInitialized = true
    }

    // showTimestamp 变化
    if (newTimestamp !== undefined && newTimestamp !== showTimestamp.value) {
      showTimestamp.value = newTimestamp
      notifyLogTimestampToBackend(newTimestamp)
    }
    // fontSize 变化
    if (newFontSize !== undefined && newFontSize !== fontSize.value) {
      fontSize.value = newFontSize
    }
    // fontFamily 变化
    if (newFontFamily !== undefined && newFontFamily !== fontFamily.value) {
      fontFamily.value = newFontFamily
    }
  })

  // 监听 showTimestamp、fontSize 和 fontFamily 变化，保存设置
  watch([showTimestamp, fontSize, fontFamily], () => {
    if (watchInitialized) {
      saveFontSettings?.()
    }
  })

  // 通知后端更新日志时间戳配置
  const notifyLogTimestampToBackend = async (showTs: boolean) => {
    if (!isConnected.value) return
    try {
      // JSON 序列化确保传入 IPC 的是纯数据对象，避免 Vue reactive proxy 导致 clone 错误
      const rawConn = JSON.parse(JSON.stringify(conn))
      const connObj = connectionType === 'telnet'
        ? { connectionType: 'telnet', host: rawConn.host, port: rawConn.port, sessionId: rawConn.sessionId }
        : { connectionType: 'com', comName: rawConn.comName, sessionId: rawConn.sessionId }
      await window.connectApi.updateConnect(connObj, { logTimestamp: showTs })
    } catch (error) {
      console.error('Failed to update log timestamp config:', error)
    }
  }

  // 打开日志所在文件夹
  const openLogFolder = async () => {
    try {
      const result = await window.connectApi.openConnectLog(String(conn.sessionId), 'folder')
      if (!result.success) {
        ElMessage.error(t('terminal.openLogFolderFailed', { message: result.message }))
      }
    } catch (error) {
      ElMessage.error(t('terminal.openLogFolderFailedWithError', { error: error instanceof Error ? error.message : t('terminal.unknownError') }))
    }
  }

  // 用系统默认应用打开日志文件
  const openLogFile = async () => {
    try {
      const result = await window.connectApi.openConnectLog(String(conn.sessionId), 'file')
      if (!result.success) {
        ElMessage.error(t('terminal.openLogFileFailed', { message: result.message }))
      }
    } catch (error) {
      ElMessage.error(t('terminal.openLogFileFailedWithError', { error: error instanceof Error ? error.message : t('terminal.unknownError') }))
    }
  }

  // 日志归档：将当前日志重命名为新文件（与断开重连时创建文件的规则一致），并开始写入新文件
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

  // 关闭连接
  const handleClose = async () => {
    cleanup()
    try {
      // JSON 序列化确保传入 IPC 的是纯数据对象，避免 Vue reactive proxy 导致 clone 错误
      const rawConn = JSON.parse(JSON.stringify(conn))
      const connObj = connectionType === 'telnet'
        ? { connectionType: 'telnet', host: rawConn.host, port: rawConn.port, sessionId: rawConn.sessionId }
        : { connectionType: 'com', comName: rawConn.comName, sessionId: rawConn.sessionId }
      await window.connectApi.stopConnect(connObj)
      unifiedTerminalRef.value?.appendToTerminal(`\n连接已关闭\n`)
    } catch (error) {
      console.error('Failed to close connection:', error)
    }
    isConnected.value = false
  }

  // 发送命令
  const handleSend = async (command: string, originalInput?: string) => {
    if (!command.trim() || !isConnected.value) return

    const now = new Date()
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`
    unifiedTerminalRef.value?.appendToTerminal(`\n[${timestamp}] ${sendDisplaySuffix} ${command}\n`)
    totalTxSize += command.length
    unifiedTerminalRef.value?.updateTxBytes(command.length)

    if (onSend) {
      onSend(command, originalInput)
    } else {
      try {
        // JSON 序列化确保传入 IPC 的是纯数据对象，避免 Vue reactive proxy 导致 clone 错误
        const rawConn = JSON.parse(JSON.stringify(conn))
        const connObj = connectionType === 'telnet'
          ? { connectionType: 'telnet', host: rawConn.host, port: rawConn.port, sessionId: rawConn.sessionId }
          : { connectionType: 'com', comName: rawConn.comName, sessionId: rawConn.sessionId }
        await window.connectApi.sendData({
          conn: connObj,
          command: command.trim()
        })
      } catch (error) {
        ElMessage.error(t('terminal.commandSendFailed'))
        console.error('Failed to send:', error)
      }
    }
  }

  // 重连
  const reconnect = () => {
    // 子类实现
  }

  // 字体变化
  const handleFontChange = (font: string) => {
    fontFamily.value = font
    unifiedTerminalRef.value?.setFontFamily?.(font)
    saveFontSettings?.()
  }

  // 清理
  const cleanup = () => {
    if (removeDataListener) {
      removeDataListener()
      removeDataListener = null
    }
    if (removeCloseListener) {
      removeCloseListener()
      removeCloseListener = null
    }
    totalRxSize = 0
    totalTxSize = 0
  }

  // 暴露给父组件
  const defineExpose = () => ({
    handleFontChange,
    getFontFamily: () => {
      const unifiedFont = unifiedTerminalRef.value?.getFontFamily?.()
      return unifiedFont || fontFamily.value
    },
    getShowTimestamp: () => showTimestamp.value
  })

  // 组件卸载时清理
  onUnmounted(() => {
    cleanup()
    if (isConnected.value) {
      // JSON 序列化确保传入 IPC 的是纯数据对象，避免 Vue reactive proxy 导致 clone 错误
      const rawConn = JSON.parse(JSON.stringify(conn))
      const connObj = connectionType === 'telnet'
        ? { connectionType: 'telnet', host: rawConn.host, port: rawConn.port, sessionId: rawConn.sessionId }
        : { connectionType: 'com', comName: rawConn.comName, sessionId: rawConn.sessionId }
      window.connectApi.stopConnect(connObj).catch((err: Error) => {
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
