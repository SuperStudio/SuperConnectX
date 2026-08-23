import fs from 'fs'
import path from 'path'
import { getAppDataDir } from '../utils/AppDir'
import PreferenceStore from '../../core/storage/PreferenceStore'

const SAVE_DIR_NAME = 'userdata'

interface SidebarState {
  showConnectionList: boolean
  serialPortExpanded: boolean
  connectionGroupExpanded: Record<string, boolean>
}

// 会话恢复：记录用户重启前打开过的选项卡及连接状态
export interface SessionTab {
  id: string
  connectionType: string
  sessionId: string | number
  name?: string
  host?: string
  comName?: string
  port?: number
  connectionId?: number
  editorConnectionType?: string
  wasConnected?: boolean
  // 协议相关字段
  [key: string]: any
}

export interface SessionPanel {
  id: string
  activeTabId: string
  tabIds: string[]
}

export interface SessionState {
  tabs: SessionTab[]
  activeTabId: string
  pinnedTabIds: string[]
  panels: SessionPanel[]
  direction?: 'horizontal' | 'vertical'
  splitRatio?: number
}

interface AppSettings extends Record<string, any> {
  sidebar?: SidebarState
  terminalFontSize?: number // 全局终端字体大小（用于 Telnet 等）
  settingsActiveCategory?: string // 设置页面左侧选中的分类
  // 编辑命令中选中的分组ID，按协议类型存储，如 { telnet: 3, ssh: 1 }
  commandEditorSelectedGroupId?: Record<string, number | null>
  // 编辑命令中当前选中的命令ID，按协议类型存储，如 { telnet: 5, ssh: 2 }
  commandEditorCurrentCommandId?: Record<string, number | null>
  // 终端显示选项
  terminalWordWrap?: boolean // 自动换行
  terminalLineNumbers?: boolean // 显示行号
  terminalLogEditable?: boolean // 日志可编辑
  // 每个连接的语法高亮组选择，key为连接标识，value为语法组ID
  terminalSyntaxGroupId?: Record<string, number | undefined>
  // 会话恢复：上次退出时打开的选项卡
  session?: SessionState
  // 可扩展其他全局设置
}

export default class AppSettingsStorage extends PreferenceStore<AppSettings> {
  constructor() {
    super({
      name: 'app-settings',
      cwd: getAppUserDataPath(),
      defaults: {}
    })
  }

  getSettings(): AppSettings {
    return this.getPreferences()
  }

  saveSettings(settings: AppSettings): void {
    this.savePreferences(settings)
  }
}

function getAppUserDataPath(): string {
  const userDataPath = path.join(getAppDataDir(), SAVE_DIR_NAME)
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }
  return userDataPath
}
