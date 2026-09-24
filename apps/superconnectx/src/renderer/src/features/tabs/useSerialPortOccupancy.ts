import { reactive } from 'vue'
import type { Ref } from 'vue'
import type { TabItem } from './useTabManager'
import type { ComTerminalRef } from './types'

/** 串口占用跟踪选项 */
export interface SerialPortOccupancyOptions {
  connectionTabs: Ref<TabItem[]>
  comTerminalRefs: Record<string, ComTerminalRef>
  /** 分屏布局的 Tab 关闭同步 */
  onTabClosed: (tabId: string) => void
  /** 标签管理器的关闭（含 IPC 断开与资源清理） */
  closeTab: (tabId: string) => void | Promise<void>
}

/** 串口占用跟踪控制器 */
export interface SerialPortOccupancyController {
  /** 已占用串口路径表（COM 连接建立时置 true） */
  connectedSerialPorts: Record<string, boolean>
  /** COM 终端连接建立回调：占用对应串口 */
  markSerialPortOccupied: (comName?: string) => void
  /** COM 终端断开回调：释放对应串口 */
  releaseSerialPort: (comName?: string) => void
  /** 查询串口是否被任一 COM 终端占用 */
  isSerialPortConnected: (path: string) => boolean
  /** 从侧栏主动断开占用指定串口的 COM 终端 */
  disconnectSerialPort: (path: string) => Promise<void>
  /** 终端请求关闭（释放占用 + 分屏同步 + 关闭标签） */
  handleTerminalClose: (connId: string | number) => void
  /** 主进程连接关闭事件（onConnectClose）：仅释放占用，不动标签 */
  handleConnectClosed: (sessionId: number | string) => void
}

/**
 * 串口占用跟踪与终端关闭编排：维护 COM 连接对串口的占用表，
 * 并编排终端关闭/主进程连接断开时的占用释放与标签清理。
 */
export function useSerialPortOccupancy(
  options: SerialPortOccupancyOptions
): SerialPortOccupancyController {
  const { connectionTabs, comTerminalRefs, onTabClosed, closeTab } = options

  const connectedSerialPorts = reactive<Record<string, boolean>>({})

  const markSerialPortOccupied = (comName?: string): void => {
    if (comName) connectedSerialPorts[comName] = true
  }

  const releaseSerialPort = (comName?: string): void => {
    if (comName) delete connectedSerialPorts[comName]
  }

  const isSerialPortConnected = (path: string): boolean => !!connectedSerialPorts[path]

  const disconnectSerialPort = async (path: string): Promise<void> => {
    const tab = connectionTabs.value.find((t) => t.comName === path && t.connectionType === 'com')
    if (tab) {
      comTerminalRefs[tab.id]?.preventAutoReconnect?.()
      comTerminalRefs[tab.id]?.disconnect?.()
    }
  }

  const handleTerminalClose = (connId: string | number): void => {
    const tab = connectionTabs.value.find(
      (t) => String(t.id) === String(connId) || String(t.sessionId) === String(connId)
    )
    if (tab?.connectionType === 'com' && tab.comName) {
      delete connectedSerialPorts[tab.comName]
    }

    const tabId = tab?.id?.toString() || connId.toString()

    // 清理分屏面板中的该 tab
    onTabClosed(tabId)

    closeTab(connId.toString())
  }

  const handleConnectClosed = (sessionId: number | string): void => {
    const tab = connectionTabs.value.find((t) => String(t.sessionId) === String(sessionId))
    if (tab && tab.connectionType === 'com') {
      delete connectedSerialPorts[tab.comName!]
    }
  }

  return {
    connectedSerialPorts,
    markSerialPortOccupied,
    releaseSerialPort,
    isSerialPortConnected,
    disconnectSerialPort,
    handleTerminalClose,
    handleConnectClosed
  }
}
