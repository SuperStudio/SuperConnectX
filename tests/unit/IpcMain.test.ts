/**
 * IpcMain 测试
 * 测试主窗口生命周期管理和 IPC handler 注册
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDialogHandlers } = vi.hoisted(() => ({
  mockDialogHandlers: new Map<string, Function>()
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getName: vi.fn(() => 'SuperConnectX'),
    getVersion: vi.fn(() => '1.0.0'),
    getAppPath: vi.fn(() => '/mock/app'),
    getPath: vi.fn((key: string) => {
      if (key === 'userData') return '/mock/userData'
      if (key === 'exe') return '/mock/app/superconnectx.exe'
      return '/mock'
    }),
    setPath: vi.fn(),
    commandLine: { appendSwitch: vi.fn() },
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    quit: vi.fn()
  },
  BrowserWindow: class {
    static getFocusedWindow() { return null }
    static getAllWindows() { return [] }
    constructor() {
      // mock instance methods
      Object.assign(this, {
        loadFile: vi.fn(),
        loadURL: vi.fn(),
        hide: vi.fn(),
        on: vi.fn(),
        webContents: {
          on: vi.fn(),
          setWindowOpenHandler: vi.fn(),
          executeJavaScript: vi.fn()
        }
      })
    }
  },
  shell: { openExternal: vi.fn() },
  ipcMain: {
    handle(channel: string, handler: Function) {
      mockDialogHandlers.set(channel, handler)
    },
    on: vi.fn()
  },
  dialog: {
    showOpenDialog: vi.fn(async () => ({ filePaths: [] })),
    showSaveDialog: vi.fn(async () => ({ filePath: null }))
  },
  powerSaveBlocker: {
    start: vi.fn(() => 1),
    stop: vi.fn(),
    isStarted: vi.fn(() => false)
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  electronApp: { setAppUserModelId: vi.fn() },
  optimizer: { watchWindowShortcuts: vi.fn() },
  is: { dev: true }
}))

vi.mock('../../src/main/ipc/IpcAppLogger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('../../src/main/ipc/IpcTray', () => ({
  default: { getInstance() { return { createTray: vi.fn(), destroyTray: vi.fn(), hideToTray: vi.fn() } } }
}))

vi.mock('../../src/main/ipc/IpcConnector', () => ({
  default: { getInstance() { return { init: vi.fn(), cleanup: vi.fn(), applySettings: vi.fn() } } }
}))

vi.mock('../../src/main/storage/SettingsStorage', () => ({
  default: class {
    getSettings() { return { minimizeToTray: false, autoBackup: false, backupInterval: 0, preventSleep: false } }
  }
}))

vi.mock('../../src/main/utils/BackupManager', () => ({
  default: { getInstance() { return { performBackup: vi.fn(), getBackupList: vi.fn(() => []) } } }
}))

vi.mock('../../src/main/updater/AppUpdater', () => ({
  default: {
    getInstance() {
      return { checkForUpdates: vi.fn(), startDownload: vi.fn(), quitAndInstall: vi.fn(), cancelDownload: vi.fn(), cachedUpdateInfo: null }
    }
  }
}))

vi.mock('../../src/main/utils/PrintAppInfo', () => ({ printAppInfo: vi.fn() }))

vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(() => JSON.stringify({
      name: 'superconnectx', version: '1.0.0',
      devDependencies: { electron: '^38.1.2' },
      dependencies: { vue: '^3.5.21' }
    })),
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn()
  }
}))

import IpcMain from '../../src/main/ipc/IpcMain'

describe('IpcMain', () => {
  let ipcMainInst: IpcMain

  beforeEach(() => {
    ;(IpcMain as any).sInstance = null
    ipcMainInst = IpcMain.getInstance()
    mockDialogHandlers.clear()
  })

  describe('getInstance', () => {
    it('should return same instance', () => {
      expect(IpcMain.getInstance()).toBe(IpcMain.getInstance())
    })
  })

  describe('getVersionInfo', () => {
    it('should return version info with all fields', () => {
      const info = ipcMainInst.getVersionInfo()
      expect(info).toHaveProperty('appVersion')
      expect(info).toHaveProperty('electronVersion')
      expect(info).toHaveProperty('electronVersionFromPackage')
      expect(info).toHaveProperty('vueVersion')
      expect(info).toHaveProperty('nodeVersion')
      expect(info).toHaveProperty('chromeVersion')
      expect(info).toHaveProperty('appName')
    })

    it('should return app name', () => {
      expect(ipcMainInst.getVersionInfo().appName).toBe('SuperConnectX')
    })

    it('should return correct package versions', () => {
      const info = ipcMainInst.getVersionInfo()
      expect(info.electronVersionFromPackage).toBe('38.1.2')
      expect(info.vueVersion).toBe('3.5.21')
    })
  })

  describe('init() - dialog handlers', () => {
    it('should register dialog handlers', () => {
      ipcMainInst.init({ flush: vi.fn() }, {})
      expect(mockDialogHandlers.has('open-file-dialog')).toBe(true)
      expect(mockDialogHandlers.has('save-file-dialog')).toBe(true)
      expect(mockDialogHandlers.has('open-directory-dialog')).toBe(true)
    })

    it('should return empty filePaths when no focused window', async () => {
      ipcMainInst.init({ flush: vi.fn() }, {})
      const result = await mockDialogHandlers.get('open-file-dialog')!({}, { title: 'test' })
      expect(result).toEqual({ filePaths: [] })
    })
  })

  describe('init() - update handlers', () => {
    it('should register update handlers', () => {
      ipcMainInst.init({ flush: vi.fn() }, {})
      expect(mockDialogHandlers.has('check-for-updates')).toBe(true)
      expect(mockDialogHandlers.has('start-download')).toBe(true)
      expect(mockDialogHandlers.has('quit-and-install')).toBe(true)
      expect(mockDialogHandlers.has('cancel-download')).toBe(true)
      expect(mockDialogHandlers.has('get-cached-update-info')).toBe(true)
    })

    it('should call checkForUpdates without error', async () => {
      ipcMainInst.init({ flush: vi.fn() }, {})
      await expect(mockDialogHandlers.get('check-for-updates')!()).resolves.toBeUndefined()
    })
  })
})
