import { ref, type Ref } from 'vue'
import type { TabItem } from './useTabManager'
import type { ComTerminalRef, TelnetTerminalRef } from './types'

/** 连接状态监测组合子选项 */
export interface ConnectionStateMonitorOptions {
  /** COM 终端实例句柄表（tabId -> 实例） */
  comTerminalRefs: Record<string, ComTerminalRef>
  /** Telnet/FTP 终端实例句柄表（tabId -> 实例） */
  telnetTerminalRefs: Record<string, TelnetTerminalRef>
  /** 轮询间隔（毫秒），默认 500 */
  intervalMs?: number
}

/** 连接状态监测控制器 */
export interface ConnectionStateMonitorController {
  /** 连接状态变化计数器：任何终端连接状态变化时 +1，驱动派生状态重新计算 */
  connectionChangeCounter: Ref<number>
  /** 判断指定 Tab 当前是否处于已连接状态（COM / Telnet / FTP） */
  isConnected: (tab: TabItem) => boolean
  /** 停止轮询（宿主组件卸载时调用） */
  stopPolling: () => void
}

/**
 * 连接状态监测：组件实例上的 `isConnected` 属性不是响应式的，
 * 通过轮询对比快照的方式检测变化，并更新计数器驱动派生状态重新计算。
 */
export function useConnectionStateMonitor(
  options: ConnectionStateMonitorOptions
): ConnectionStateMonitorController {
  const { comTerminalRefs, telnetTerminalRefs, intervalMs = 500 } = options

  const connectionChangeCounter = ref(0)

  const isConnected = (tab: TabItem): boolean => {
    if (tab.connectionType === 'com') {
      return !!comTerminalRefs[tab.id]?.isConnected
    }
    if (tab.connectionType === 'telnet' || tab.connectionType === 'ftp') {
      return !!telnetTerminalRefs[tab.id]?.isConnected
    }
    return false
  }

  let prevConnectedSnapshot = ''
  const pollConnectionStates = (): void => {
    const parts: string[] = []
    for (const key of Object.keys(comTerminalRefs)) {
      parts.push(`com:${key}:${comTerminalRefs[key]?.isConnected ?? false}`)
    }
    for (const key of Object.keys(telnetTerminalRefs)) {
      parts.push(`telnet:${key}:${telnetTerminalRefs[key]?.isConnected ?? false}`)
    }
    const snapshot = parts.join('|')
    if (snapshot !== prevConnectedSnapshot) {
      prevConnectedSnapshot = snapshot
      connectionChangeCounter.value++
    }
  }

  const pollTimer = setInterval(pollConnectionStates, intervalMs)

  return {
    connectionChangeCounter,
    isConnected,
    stopPolling: () => clearInterval(pollTimer)
  }
}
