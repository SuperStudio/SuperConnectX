import Store from 'electron-store'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const SAVE_DIR_NAME = 'userdata'

interface ComPortSettings {
  baudRate: number
  dataBits: number
  stopBits: number
  parity: string
  encoding: string
  readTimeout: number
  writeTimeout: number
}

interface StoredData {
  ports: { [comName: string]: ComPortSettings }
}

export default class ComSettingsStorage {
  private storageData: Store<any>
  private readonly STORAGE_NAME = 'com-settings'

  constructor() {
    this.storageData = new Store<any>({
      name: this.STORAGE_NAME,
      cwd: this.getAppUserDataPath(),
      defaults: { ports: {} }
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

  getSettings(comName: string): ComPortSettings | null {
    const all = this.storageData.get('ports') as StoredData['ports'] || {}
    return all[comName] || null
  }

  saveSettings(comName: string, settings: ComPortSettings): void {
    const all = this.storageData.get('ports') as StoredData['ports'] || {}
    all[comName] = settings
    this.storageData.set('ports', all)
  }
}
