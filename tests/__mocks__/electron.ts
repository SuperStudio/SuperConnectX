import path from 'path'
import os from 'os'
import fs from 'fs'

// 确保 userData 目录存在（SafeStorageString 需要写入 scx.key）
const USERDATA_DIR = path.join(os.tmpdir(), 'superconnectx-test-userdata')
if (!fs.existsSync(USERDATA_DIR)) {
  fs.mkdirSync(USERDATA_DIR, { recursive: true })
}

// vitest 中 mock electron 模块，提供 app.getPath 等最小实现
export const app = {
  isPackaged: true,
  getName: () => 'SuperConnectX',
  getVersion: () => '1.0.0',
  getPath(name: string): string {
    const map: Record<string, string> = {
      userData: USERDATA_DIR,
      exe: process.execPath,
      home: os.homedir()
    }
    return map[name] ?? os.tmpdir()
  }
}

// 导出其他可能被引用的 electron 子模块（空对象，按需扩展）
export const BrowserWindow = {}
export const ipcMain = {
  handle: () => {},
  on: () => {},
  removeHandler: () => {},
  removeAllListeners: () => {}
}
export const dialog = {}
export const shell = {
  openPath: () => Promise.resolve(''),
  showItemInFolder: () => Promise.resolve('')
}
export const screen = {
  getPrimaryDisplay: () => ({
    size: { width: 1920, height: 1080 },
    scaleFactor: 1.5
  })
}
