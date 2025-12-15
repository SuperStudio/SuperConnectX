import Store from 'electron-store'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const SAVE_DIR_NAME = 'userdata'

export default class BaseStorage {
  storageData: Store

  storageName: string

  constructor(storeName, defaultData) {
    this.storageName = storeName
    this.storageData = new Store({
      name: storeName,
      cwd: this.getAppUserDataPath(),
      defaults: defaultData
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

  getAll() {
    return this.storageData.get(this.storageName)
  }

  saveAll(data: never[]) {
    this.storageData.set(this.storageName, data)
  }

  add(data: any) {}

  update(data: any) {}

  delete(id: number) {}
}
