/**
 * IpcStorage 测试
 * 测试数据存储 IPC handler 注册和核心逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockHandlers, mockIpcMain } = vi.hoisted(() => {
  const handlers = new Map<string, Function>()
  return {
    mockHandlers: handlers,
    mockIpcMain: {
      _handlers: handlers,
      handle(channel: string, handler: Function) {
        handlers.set(channel, handler)
      }
    }
  }
})

vi.mock('electron', () => ({ ipcMain: mockIpcMain }))

vi.mock('../../src/main/ipc/IpcAppLogger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('../../src/main/ipc/IpcConnector', () => ({
  default: { getInstance() { return { applySettings: vi.fn(), cleanup: vi.fn() } } }
}))

vi.mock('../../src/main/utils/BackupManager', () => ({
  default: { getInstance() { return { getBackupList: vi.fn(() => []), restoreBackup: vi.fn(), getNextBackupDate: vi.fn(() => null) } } }
}))

vi.mock('../../src/main/storage/ConnectionStorage', () => ({
  default: class {
    getAll() { return [] }
    add(_c: any) { return {} }
    update(_c: any) {}
    delete(_id: number) {}
    getByIdWithPassword(_id: number) { return null }
  }
}))

vi.mock('../../src/main/storage/PreSetCommandStorage', () => ({
  default: class {
    getAll() { return [] }
    add(_c: any) { return '' }
    update(_c: any) { return '' }
    delete(_id: number) {}
    deleteByGroupId(_g: number) {}
    exportCommands(..._a: any[]) {}
    importCommands(..._a: any[]) {}
    importFromSuperCom(..._a: any[]) {}
  }
}))

vi.mock('../../src/main/storage/CommandGroupStorage', () => ({
  default: class {
    getAll() { return [] }
    add(_g: any) { return {} }
    update(_g: any) { return null }
    delete(_id: number) {}
  }
}))

vi.mock('../../src/main/storage/ComSettingsStorage', () => ({
  default: class {
    getSettings(_n: string) { return null }
    saveSettings(..._a: any[]) {}
    getBaudRates() { return [9600, 115200] }
    saveBaudRates(_r: number[]) {}
  }
}))

vi.mock('../../src/main/storage/AppSettingsStorage', () => ({
  default: class {
    getSettings() { return {} }
    saveSettings(_s: any) {}
  }
}))

vi.mock('../../src/main/storage/SettingsStorage', () => ({
  default: class {
    getSettings() { return { syntaxRuleGroups: [] } }
    getDefaults() { return {} }
    saveSettings(_s: any) {}
  }
}))

vi.mock('../../src/main/storage/CommandHistoryStorage', () => ({
  default: class {
    getHistory(_p: string) { return [] }
    addCommand(..._a: any[]) {}
    clearHistory(_p: string) {}
    removeCommand(..._a: any[]) {}
    applyMaxCount(_m: number) {}
  }
}))

vi.mock('../../src/main/storage/ShortcutsStorage', () => ({
  default: class {
    getAll() { return [] }
    getDefaults() { return [] }
    saveAll(_s: any[]) {}
  },
  SHORTCUT_ACTIONS: [{ action: 'connect', description: '连接' }, { action: 'disconnect', description: '断开' }]
}))

vi.mock('archiver', () => ({
  default: function() {
    return { pipe: vi.fn(), append: vi.fn(), finalize: vi.fn(), on: vi.fn() }
  }
}))

vi.mock('adm-zip', () => ({
  default: class { getEntries() { return [] } }
}))

import IpcStorage from '../../src/main/ipc/IpcStorage'

describe('IpcStorage', () => {
  let ipcStorage: IpcStorage

  beforeEach(() => {
    ;(IpcStorage as any).sInstance = null
    ipcStorage = IpcStorage.getInstance()
    mockHandlers.clear()
  })

  describe('getInstance', () => {
    it('should return same instance', () => {
      expect(IpcStorage.getInstance()).toBe(IpcStorage.getInstance())
    })
  })

  describe('init() handler registration', () => {
    it('should register storage handlers', () => {
      ipcStorage.init()
      expect(mockHandlers.has('get-connections')).toBe(true)
      expect(mockHandlers.has('add-connection')).toBe(true)
      expect(mockHandlers.has('delete-connection')).toBe(true)
    })

    it('should register preset command handlers', () => {
      ipcStorage.init()
      expect(mockHandlers.has('get-preset-commands')).toBe(true)
      expect(mockHandlers.has('add-preset-command')).toBe(true)
    })

    it('should register command group handlers', () => {
      ipcStorage.init()
      expect(mockHandlers.has('get-command-groups')).toBe(true)
      expect(mockHandlers.has('add-command-group')).toBe(true)
    })

    it('should register import/export handlers', () => {
      ipcStorage.init()
      expect(mockHandlers.has('export-commands')).toBe(true)
      expect(mockHandlers.has('import-commands')).toBe(true)
      expect(mockHandlers.has('export-data')).toBe(true)
      expect(mockHandlers.has('import-data')).toBe(true)
    })

    it('should register COM settings handlers', () => {
      ipcStorage.init()
      expect(mockHandlers.has('get-com-settings')).toBe(true)
      expect(mockHandlers.has('get-baud-rates')).toBe(true)
    })

    it('should register settings handlers', () => {
      ipcStorage.init()
      expect(mockHandlers.has('get-settings')).toBe(true)
      expect(mockHandlers.has('save-settings')).toBe(true)
      expect(mockHandlers.has('get-app-settings')).toBe(true)
    })

    it('should register shortcut handlers', () => {
      ipcStorage.init()
      expect(mockHandlers.has('get-shortcuts')).toBe(true)
      expect(mockHandlers.has('get-shortcut-actions')).toBe(true)
    })

    it('should register command history handlers', () => {
      ipcStorage.init()
      expect(mockHandlers.has('get-command-history')).toBe(true)
      expect(mockHandlers.has('add-command-history')).toBe(true)
      expect(mockHandlers.has('clear-command-history')).toBe(true)
    })

    it('should register syntax highlight handlers', () => {
      ipcStorage.init()
      expect(mockHandlers.has('get-syntax-rule-groups')).toBe(true)
      expect(mockHandlers.has('save-syntax-rule-groups')).toBe(true)
    })

    it('should register backup handlers', () => {
      ipcStorage.init()
      expect(mockHandlers.has('get-backup-list')).toBe(true)
      expect(mockHandlers.has('restore-backup')).toBe(true)
    })

    it('should have exactly 39 handlers', () => {
      ipcStorage.init()
      expect(mockHandlers.size).toBe(39)
    })
  })

  describe('handler behavior', () => {
    it('should return empty array for get-connections', async () => {
      ipcStorage.init()
      const result = await mockHandlers.get('get-connections')!()
      expect(Array.isArray(result)).toBe(true)
    })

    it('should save settings without error', async () => {
      ipcStorage.init()
      const result = await mockHandlers.get('save-settings')!({}, { test: 'value' })
      expect(result).toBe(true)
    })

    it('should return baud rates array', async () => {
      ipcStorage.init()
      const result = await mockHandlers.get('get-baud-rates')!()
      expect(Array.isArray(result)).toBe(true)
    })

    it('should return shortcut actions', async () => {
      ipcStorage.init()
      const result = await mockHandlers.get('get-shortcut-actions')!()
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })
  })
})
