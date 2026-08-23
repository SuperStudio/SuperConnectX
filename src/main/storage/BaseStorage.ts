import fs from 'fs'
import path from 'path'
import { getAppDataDir } from '../utils/AppDir'
import StoreRepository from '../../core/storage/StoreRepository'

const SAVE_DIR_NAME = 'userdata'

function getAppUserDataPath(): string {
  const userDataPath = path.join(getAppDataDir(), SAVE_DIR_NAME)
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }

  return userDataPath
}

export default class BaseStorage<T = any> extends StoreRepository {
  constructor(storeName: string, defaultData: any) {
    super({
      name: storeName,
      cwd: getAppUserDataPath(),
      defaults: defaultData
    })
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
