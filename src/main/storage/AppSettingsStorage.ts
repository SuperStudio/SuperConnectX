import Store from 'electron-store'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const SAVE_DIR_NAME = 'userdata'

interface SidebarState {
  showConnectionList: boolean
  serialPortExpanded: boolean
  connectionGroupExpanded: Record<string, boolean>
}

interface AppSettings {
  sidebar?: SidebarState
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
