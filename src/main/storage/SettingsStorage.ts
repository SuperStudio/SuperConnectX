import Store from 'electron-store'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import logger from '../ipc/IpcAppLogger'

const SAVE_DIR_NAME = 'userdata'

interface Settings {
  // 基本设置
  minimizeToTray?: boolean
  logSplit?: boolean
  logSplitSize?: number
  autoScroll?: boolean
  autoScrollToast?: boolean
  autoScrollOnFocus?: boolean
  autoScrollAfterSend?: boolean
  autoScrollOnWheel?: boolean
  language?: string
  autoBackup?: boolean
  backupInterval?: number
  autoStart?: boolean
  preventSleep?: boolean
  maxDisplayText?: number
  // 串口设置
  supportedBaudRates?: number[]
  showPortType?: boolean
  // 日志
  enableLogStorage?: boolean
  logPath?: string
  maxLogSize?: number
  logTimestamp?: boolean
  logHex?: boolean
  // 语法高亮
  enableSyntaxHighlight?: boolean
  syntaxTheme?: string
  // 搜索
  searchCaseSensitive?: boolean
  searchRegex?: boolean
  searchWholeWord?: boolean
  // 命令历史
  commandHistoryMaxCount?: number
  showCommandHistory?: boolean
}

const defaultSettings: Settings = {
  // 基本设置
  minimizeToTray: false,
  logSplit: true,
  logSplitSize: 10,
  autoScroll: true,
  autoScrollToast: false,
  autoScrollOnFocus: false,
  autoScrollAfterSend: false,
  autoScrollOnWheel: false,
  language: 'zh-CN',
  autoBackup: false,
  backupInterval: 7,
  autoStart: false,
  preventSleep: false,
  maxDisplayText: 30,
  // 串口设置
  supportedBaudRates: [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1500000],
  showPortType: true,
  // 日志
  enableLogStorage: true,
  logPath: '',
  maxLogSize: 10,
  logTimestamp: true,
  logHex: false,
  // 语法高亮
  enableSyntaxHighlight: true,
  syntaxTheme: 'dark',
  // 搜索
  searchCaseSensitive: false,
  searchRegex: false,
  searchWholeWord: false,
  // 命令历史
  commandHistoryMaxCount: 10,
  showCommandHistory: true
}

export default class SettingsStorage {
  private storageData: Store<any>
  private readonly STORAGE_NAME = 'settings'

  constructor() {
    const cwd = this.getAppUserDataPath()
    this.storageData = new Store<any>({
      name: this.STORAGE_NAME,
      cwd,
      defaults: defaultSettings
    })
    logger.debug(`SettingsStorage initialized at: ${cwd}`)
  }

  private getAppUserDataPath(): string {
    const exePath = app.getPath('exe')
    let exeDir = path.dirname(exePath)
    if (process.platform === 'darwin') {
      exeDir = path.resolve(exeDir, '../../..')
    }

    const userDataPath = path.join(exeDir, SAVE_DIR_NAME)
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }

    return userDataPath
  }

  getSettings(): Settings {
    return { ...defaultSettings, ...this.storageData.store }
  }

  saveSettings(settings: Settings): void {
    Object.keys(settings).forEach((key) => {
      this.storageData.set(key, (settings as any)[key])
    })
  }

  getDefaults(): Settings {
    return { ...defaultSettings }
  }
}
