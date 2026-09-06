/**
 * 连接工作区 Tab 管理相关共享类型
 */

/** 串口终端（features/terminal/ComTerminal.vue）对外暴露的实例句柄描述 */
export interface ComTerminalRef {
  isConnected?: boolean
  reconnect?: () => void
  preventAutoReconnect?: () => void
  disconnect?: () => void
  cleanup?: () => void
  clearTerminal?: () => void
  getFontFamily?: () => string
  getRemark?: () => string
  updateRemark?: (remark: string) => Promise<void>
  handleFontChange?: (fontFamily: string) => void
  handleFontSizeChange?: (action: string) => void
  refreshGroupsCmds?: () => void
  setWordWrap?: (value: boolean) => void
  setLineNumbers?: (value: boolean) => void
  setLogEditable?: (value: boolean) => void
  [key: string]: any
}

/** Telnet/FTP 终端（features/terminal/TelnetTerminal.vue）对外暴露的实例句柄描述 */
export interface TelnetTerminalRef {
  isConnected?: boolean
  reconnect?: () => void
  preventAutoReconnect?: () => void
  disconnect?: () => void
  cleanup?: () => void
  clearTerminal?: () => void
  getFontFamily?: () => string
  handleFontChange?: (fontFamily: string) => void
  handleFontSizeChange?: (action: string) => void
  refreshGroupsCmds?: () => void
  setWordWrap?: (value: boolean) => void
  setLineNumbers?: (value: boolean) => void
  setLogEditable?: (value: boolean) => void
  [key: string]: any
}
