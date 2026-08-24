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

vi.mock('../../src/main/storage/LogFilterStorage', () => ({
  default: class {
    getSettings() { return {} }
    saveSettings(_s: any) {}
  }
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
import RuntimeEventHub from '../../src/main/services/RuntimeEventHub'

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
  })

  describe('handler behavior', () => {
    it('should return empty array for get-connections', async () => {
      ipcStorage.init()
      const result = await mockHandlers.get('get-connections')!()
      expect(Array.isArray(result)).toBe(true)
    })

    it('should publish a revisioned event after GUI catalog changes', async () => {
      const events = new RuntimeEventHub()
      ipcStorage.init(events)

      await mockHandlers.get('add-connection')!({}, { name: 'COM test' })

      expect(ipcStorage.getConfigService().get('connections').revision).toBe(1)
      expect(events.readSince(0).events.at(-1)).toMatchObject({
        eventType: 'config.changed',
        source: 'gui',
        payload: { domain: 'connections', revision: 1, changed: { operation: 'created' } }
      })
    })

    it('should save settings without error', async () => {
      ipcStorage.init()
      const result = await mockHandlers.get('save-settings')!({}, { test: 'value' })
      expect(result).toBe(true)
    })

    it('should accept the primitive values used by app settings', async () => {
      ipcStorage.init()
      const result = await mockHandlers.get('save-app-settings')!(
        {},
        {
          settingsActiveCategory: 'ai-bridge',
          terminalFontSize: 14,
          terminalWordWrap: true
        }
      )
      expect(result).toBe(true)
    })

    it('should accept string and number values used by the log filter', async () => {
      ipcStorage.init()
      const result = await mockHandlers.get('save-log-filter')!(
        {},
        { pattern: 'ERROR|WARN', panelWidth: 320 }
      )
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

    it('should expose revisioned application config domains', async () => {
      ipcStorage.init()
      const configService = ipcStorage.getConfigService()
      expect(configService.describe().map((schema) => schema.domain)).toEqual(
        expect.arrayContaining(['settings', 'com-settings', 'app-settings', 'connections'])
      )

      const result = await configService.patch({
        domain: 'settings',
        patch: { autoScroll: false },
        expectedRevision: 0,
        source: 'ai'
      })
      expect(result.snapshot.revision).toBe(1)
      expect(result.changed).toEqual({ autoScroll: false })
    })

    it('should keep AI service settings out of the general settings schema', () => {
      ipcStorage.init()
      const settingsSchema = ipcStorage
        .getConfigService()
        .describe('settings')
        .find((schema) => schema.domain === 'settings')
      const maxSize = settingsSchema?.fields.find(
        (field) => field.path === 'aiActivityLogMaxSizeMb'
      )
      const maxFiles = settingsSchema?.fields.find(
        (field) => field.path === 'aiActivityLogMaxFiles'
      )
      const logPath = settingsSchema?.fields.find((field) => field.path === 'aiActivityLogPath')

      expect(logPath).toBeUndefined()
      expect(maxSize).toBeUndefined()
      expect(maxFiles).toBeUndefined()
    })

    it('should reject COM settings outside the GUI option range', async () => {
      ipcStorage.init()
      const configService = ipcStorage.getConfigService()

      await expect(
        configService.patch({
          domain: 'com-settings',
          targetId: 'COM_TEST',
          patch: { dataBits: 9, parity: 'invalid', readTimeout: -1 },
          source: 'ai'
        })
      ).rejects.toMatchObject({ code: 'CONFIG_INVALID_PATCH' })

      await expect(
        configService.patch({
          domain: 'com-settings',
          targetId: 'COM_TEST',
          patch: {
            baudRate: 115200,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            readTimeout: 0,
            writeTimeout: 0,
            flowControl: 'none'
          },
          source: 'ai'
        })
      ).resolves.toMatchObject({ success: true })
    })

    it('should reject settings outside the GUI range', async () => {
      ipcStorage.init()
      const configService = ipcStorage.getConfigService()

      await expect(
        configService.patch({
          domain: 'settings',
          patch: { maxDisplayText: 0 },
          source: 'ai'
        })
      ).rejects.toMatchObject({ code: 'CONFIG_INVALID_PATCH' })
      await expect(
        configService.patch({
          domain: 'settings',
          patch: { supportedBaudRates: [9600, '115200'] },
          source: 'ai'
        })
      ).rejects.toMatchObject({ code: 'CONFIG_INVALID_PATCH' })
    })
  })
})
