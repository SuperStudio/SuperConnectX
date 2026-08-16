import Store from 'electron-store'
import fs from 'fs'
import path from 'path'
import { getAppDataDir } from '../utils/AppDir'

const SAVE_DIR_NAME = 'userdata'

export interface LogFilterSettings {
  pattern?: string // 正则表达式内容
  panelWidth?: number // 面板宽度
}

export default class LogFilterStorage {
  private storageData: Store<any>
  private readonly STORAGE_NAME = 'log-filter'

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

  getSettings(): LogFilterSettings {
    return this.storageData.store || {}
  }

  saveSettings(settings: LogFilterSettings): void {
    if (settings.pattern !== undefined) {
      this.storageData.set('pattern', settings.pattern)
    }
    if (settings.panelWidth !== undefined) {
      this.storageData.set('panelWidth', settings.panelWidth)
    }
  }
}
