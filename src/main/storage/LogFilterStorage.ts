import fs from 'fs'
import path from 'path'
import { getAppDataDir } from '../utils/AppDir'
import PreferenceStore from '../../core/storage/PreferenceStore'

const SAVE_DIR_NAME = 'userdata'

export interface LogFilterSettings extends Record<string, any> {
  pattern?: string // 正则表达式内容
  panelWidth?: number // 面板宽度
}

export default class LogFilterStorage extends PreferenceStore<LogFilterSettings> {
  constructor() {
    super({
      name: 'log-filter',
      cwd: getAppUserDataPath(),
      defaults: {}
    })
  }

  getSettings(): LogFilterSettings {
    return this.getPreferences()
  }

  saveSettings(settings: LogFilterSettings): void {
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
