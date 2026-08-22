import Store from 'electron-store'
import fs from 'fs'
import path from 'path'
import { getAppDataDir } from '../utils/AppDir'

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

interface AppSettings {
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

export default class AppSettingsStorage {
  private storageData: Store<any>
  private readonly STORAGE_NAME = 'app-settings'

  constructor() {
    this.storageData = new Store<any>({
      name: this.STORAGE_NAME,
      cwd: this.getAppUserDataPath(),
      defaults: {}
    })
  }

  private getAppUserDataPath(): string {
    const userDataPath = path.join(getAppDataDir(), SAVE_DIR_NAME)
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }

    return userDataPath
  }

  getSettings(): AppSettings {
    return this.storageData.store || {}
  }

  saveSettings(settings: AppSettings): void {
    // 使用 set 方法确保数据被正确保存
    Object.keys(settings).forEach((key) => {
      this.storageData.set(key, (settings as any)[key])
    })
  }
}
