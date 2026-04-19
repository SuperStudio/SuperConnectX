import Store from 'electron-store'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const SAVE_DIR_NAME = 'userdata'

export default class BaseStorage<T = any> {
  storageData: Store<any>

  storageName: string

  constructor(storeName: string, defaultData: any) {
    this.storageName = storeName
    this.storageData = new Store<any>({
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

  getAll(): T[] {
    return (this.storageData.get(this.storageName) as T[]) || []
  }

  saveAll(data: T[]) {
    this.storageData.set(this.storageName, data)
  }

  add(_data: T) {}

  update(_data: T) {}

  delete(_id: number) {}
}
