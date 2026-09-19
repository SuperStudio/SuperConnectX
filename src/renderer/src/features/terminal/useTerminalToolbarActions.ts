import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import type { Ref } from 'vue'
import type { TabItem } from '../tabs/useTabManager'
import type { ComTerminalRef, TelnetTerminalRef } from '../tabs/types'

/** 终端工具栏动作编排选项 */
export interface TerminalToolbarActionsOptions {
  activeTabId: Ref<string>
  connectionTabs: Ref<TabItem[]>
  comTerminalRefs: Record<string, ComTerminalRef>
  telnetTerminalRefs: Record<string, TelnetTerminalRef>
  terminalWordWrap: Ref<boolean>
  terminalLineNumbers: Ref<boolean>
  terminalLogEditable: Ref<boolean>
  applyToAllTerminals: (
    connectionTabs: TabItem[],
    comTerminalRefs: Record<string, ComTerminalRef>,
    telnetTerminalRefs: Record<string, TelnetTerminalRef>,
    method: string,
    value: boolean
  ) => void
  saveTerminalDisplaySettings: () => Promise<void>
}

/** 终端工具栏动作编排控制器 */
export interface TerminalToolbarActionsController {
  /** 切换自动换行并应用到全部终端 */
  handleToggleWordWrap: () => Promise<void>
  /** 切换行号并应用到全部终端 */
  handleToggleLineNumbers: () => Promise<void>
  /** 切换日志可编辑并应用到全部终端 */
  handleToggleLogEditable: () => Promise<void>
  /** 刷新当前活动终端的分组命令 */
  refreshHandler: () => void
  /** 日志另存为（作用于当前活动终端） */
  handleSaveLogAs: () => Promise<void>
}

/**
 * 终端工具栏动作编排：标题栏/工具栏触发的终端显示偏好切换、
 * 分组命令刷新与日志另存为。
 */
export function useTerminalToolbarActions(
  options: TerminalToolbarActionsOptions
): TerminalToolbarActionsController {
  const {
    activeTabId,
    connectionTabs,
    comTerminalRefs,
    telnetTerminalRefs,
    terminalWordWrap,
    terminalLineNumbers,
    terminalLogEditable,
    applyToAllTerminals,
    saveTerminalDisplaySettings
  } = options

  const { t } = useI18n()

  const handleToggleWordWrap = async (): Promise<void> => {
    terminalWordWrap.value = !terminalWordWrap.value
    applyToAllTerminals(
      connectionTabs.value,
      comTerminalRefs,
      telnetTerminalRefs,
      'setWordWrap',
      terminalWordWrap.value
    )
    await saveTerminalDisplaySettings()
  }

  const handleToggleLineNumbers = async (): Promise<void> => {
    terminalLineNumbers.value = !terminalLineNumbers.value
    applyToAllTerminals(
      connectionTabs.value,
      comTerminalRefs,
      telnetTerminalRefs,
      'setLineNumbers',
      terminalLineNumbers.value
    )
    await saveTerminalDisplaySettings()
  }

  const handleToggleLogEditable = async (): Promise<void> => {
    terminalLogEditable.value = !terminalLogEditable.value
    applyToAllTerminals(
      connectionTabs.value,
      comTerminalRefs,
      telnetTerminalRefs,
      'setLogEditable',
      terminalLogEditable.value
    )
    await saveTerminalDisplaySettings()
  }

  const refreshHandler = (): void => {
    if (activeTabId.value) {
      const tabId = activeTabId.value
      if (comTerminalRefs[tabId]) {
        comTerminalRefs[tabId]?.refreshGroupsCmds?.()
      } else {
        telnetTerminalRefs[tabId]?.refreshGroupsCmds?.()
      }
    }
  }

  const handleSaveLogAs = async (): Promise<void> => {
    const tabId = activeTabId.value
    if (!tabId) {
      ElMessage.warning(t('titlebar.noActiveTerminal'))
      return
    }
    const terminal = comTerminalRefs[tabId] || telnetTerminalRefs[tabId]
    if (!terminal?.saveLogFileAs) {
      ElMessage.warning(t('titlebar.noActiveTerminal'))
      return
    }
    await terminal.saveLogFileAs()
  }

  return {
    handleToggleWordWrap,
    handleToggleLineNumbers,
    handleToggleLogEditable,
    refreshHandler,
    handleSaveLogAs
  }
}
