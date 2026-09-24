import { ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TabItem } from '../tabs/useTabManager'
import type { ComTerminalRef, TelnetTerminalRef } from '../tabs/types'

/** 通知容器对外暴露的最小句柄（NotifyContainer.vue defineExpose 的结构子集） */
export interface NotifyContainerHandle {
  add: (title: string, message: string, duration?: number) => unknown
}

/** 终端事件通知编排选项 */
export interface TerminalEventNotificationsOptions {
  notifyContainerRef: Ref<NotifyContainerHandle | null>
  connectionTabs: Ref<TabItem[]>
  comTerminalRefs: Record<string, ComTerminalRef>
  telnetTerminalRefs: Record<string, TelnetTerminalRef>
}

/** 终端事件通知编排控制器 */
export interface TerminalEventNotificationsController {
  /** 最近一次发送的命令（状态栏展示） */
  lastSentCommand: Ref<string>
  /** 终端命令发送回调（更新状态栏最近命令） */
  handleCommandSent: (command: string) => void
  /** SuperCom 数据导入结果通知 */
  handleImportNotify: (payload: { success: boolean; title: string; message: string }) => void
  /** 日志切割回调：通知并清空对应终端显示 */
  handleLogSplit: (data: { connId: string; oldFileName: string; newFileName: string }) => void
  /** 终端文本清空事件（window 自定义事件） */
  handleTerminalTextCleared: (e: Event) => void
  /** 自动滚动停止提示事件（window 自定义事件） */
  handleAutoScrollToast: (e: Event) => void
}

/**
 * 终端事件通知编排：终端/工具栏产生的用户可见通知
 * （命令发送、数据导入、日志切割、文本清空、自动滚动停止）。
 */
export function useTerminalEventNotifications(
  options: TerminalEventNotificationsOptions
): TerminalEventNotificationsController {
  const { notifyContainerRef, connectionTabs, comTerminalRefs, telnetTerminalRefs } = options

  const { t } = useI18n()

  const lastSentCommand = ref('')

  const handleCommandSent = (command: string): void => {
    lastSentCommand.value = command
  }

  const handleImportNotify = (payload: {
    success: boolean
    title: string
    message: string
  }): void => {
    notifyContainerRef.value?.add(payload.title, payload.message)
  }

  const handleLogSplit = (data: {
    connId: string
    oldFileName: string
    newFileName: string
  }): void => {
    const tab = connectionTabs.value.find((t) => String(t.sessionId) === String(data.connId))
    const tabName = tab?.name || tab?.comName || data.connId
    const message = t('notification.logSplitMessage', { name: tabName, file: data.newFileName })
    notifyContainerRef.value?.add(t('notification.logSplit'), message)
    if (tab) {
      const tabId = tab.id
      if (tab.connectionType === 'com') {
        comTerminalRefs[tabId]?.clearTerminal?.()
      } else if (tab.connectionType === 'telnet') {
        telnetTerminalRefs[tabId]?.clearTerminal?.()
      }
    }
  }

  const handleTerminalTextCleared = (e: Event): void => {
    const detail = (e as CustomEvent).detail
    const name = detail?.connectionName || ''
    notifyContainerRef.value?.add(
      t('notification.textCleared'),
      t('notification.textClearedMessage', { name })
    )
  }

  const handleAutoScrollToast = (e: Event): void => {
    const detail = (e as CustomEvent).detail
    const name = detail?.connectionName || ''
    notifyContainerRef.value?.add(
      t('notification.autoScrollStopped'),
      t('notification.autoScrollStoppedMessage', { name })
    )
  }

  return {
    lastSentCommand,
    handleCommandSent,
    handleImportNotify,
    handleLogSplit,
    handleTerminalTextCleared,
    handleAutoScrollToast
  }
}
