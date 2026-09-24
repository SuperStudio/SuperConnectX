import Store from 'electron-store'
import fs from 'fs'
import path from 'path'
import logger from '../ipc/IpcAppLogger'
import SettingsStorage from './SettingsStorage'
import { getAppDataDir } from '../utils/AppDir'

const SAVE_DIR_NAME = 'userdata'

export default class CommandHistoryStorage {
  private storageData: Store<any>
  private readonly STORAGE_NAME = 'command-history'
  private settingsStorage: SettingsStorage

  constructor(settingsStorage: SettingsStorage) {
    this.settingsStorage = settingsStorage
    const cwd = this.getAppUserDataPath()
    this.storageData = new Store<any>({
      name: this.STORAGE_NAME,
      cwd,
      defaults: {}
    })
    logger.debug(`CommandHistoryStorage initialized at: ${cwd}`)
  }

  private getAppUserDataPath(): string {
    const userDataPath = path.join(getAppDataDir(), SAVE_DIR_NAME)
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }

    return userDataPath
  }

  private getMaxCount(): number {
    const settings = this.settingsStorage.getSettings()
    return settings.commandHistoryMaxCount || 10
  }

  getHistory(protocolType: string): string[] {
    const key = protocolType.toLowerCase()
    const history = this.storageData.get(key, []) as string[]
    return history
  }

  addCommand(protocolType: string, command: string): void {
    if (!command.trim()) return
    const key = protocolType.toLowerCase()
    const maxCount = this.getMaxCount()
    let history = this.storageData.get(key, []) as string[]

    // Remove duplicate if exists
    history = history.filter(c => c !== command)

    // Add to beginning
    history.unshift(command)

    // Trim to max count
    if (history.length > maxCount) {
      history = history.slice(0, maxCount)
    }

    this.storageData.set(key, history)
  }

  clearHistory(protocolType: string): void {
    const key = protocolType.toLowerCase()
    this.storageData.set(key, [])
  }

  removeCommand(protocolType: string, command: string): void {
    const key = protocolType.toLowerCase()
    let history = this.storageData.get(key, []) as string[]
    history = history.filter(c => c !== command)
    this.storageData.set(key, history)
  }

  applyMaxCount(maxCount: number): void {
    // Trim all histories to the new max count
    const allKeys = Object.keys(this.storageData.store)
    for (const key of allKeys) {
      const history = this.storageData.get(key, []) as string[]
      if (history.length > maxCount) {
        this.storageData.set(key, history.slice(0, maxCount))
      }
    }
  }
}
