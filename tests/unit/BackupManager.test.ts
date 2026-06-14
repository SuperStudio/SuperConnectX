import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs'

// Mock the logger
vi.mock('../../src/main/ipc/IpcAppLogger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

// Mock electron to redirect app.getPath('exe') to our test dir
const TEST_ROOT = path.join(os.tmpdir(), 'superconnectx-backup-test')

vi.mock('electron', async () => {
  const actual = await vi.importActual('../__mocks__/electron') as any
  return {
    ...actual,
    app: {
      getPath(name: string): string {
        if (name === 'exe') {
          // Return a fake exe path inside TEST_ROOT so BackupManager uses TEST_ROOT as app dir
          return path.join(TEST_ROOT, 'fake-app', 'SuperConnectX.exe')
        }
        const map: Record<string, string> = {
          userData: path.join(TEST_ROOT, 'userdata'),
          home: os.homedir()
        }
        return map[name] ?? os.tmpdir()
      }
    }
  }
})

// Reset singleton before importing
let BackupManagerModule: any

function setupTestDir(): void {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true })
  }
  fs.mkdirSync(TEST_ROOT, { recursive: true })
}

function cleanupTestDir(): void {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true })
  }
}

describe('BackupManager', () => {
  beforeEach(async () => {
    setupTestDir()
    // Re-import to get fresh singleton each test
    vi.resetModules()
    BackupManagerModule = await import('../../src/main/utils/BackupManager')
  })

  afterEach(() => {
    cleanupTestDir()
  })

  function getInstance(): any {
    return BackupManagerModule.default.getInstance()
  }

  describe('singleton', () => {
    it('getInstance 返回相同实例', () => {
      const a = BackupManagerModule.default.getInstance()
      const b = BackupManagerModule.default.getInstance()
      expect(a).toBe(b)
    })
  })

  describe('performBackup', () => {
    it('userdata 目录不存在时跳过备份', () => {
      // No userdata dir created
      const bm = getInstance()
      // Should not throw
      expect(() => bm.performBackup(7)).not.toThrow()
    })

    it('创建 userdata 目录后可执行备份', () => {
      // Create the userdata dir that BackupManager expects
      // BackupManager looks for <appDir>/userdata, where appDir is dirname of exe
      const appDir = path.join(TEST_ROOT, 'fake-app')
      const userdataDir = path.join(appDir, 'userdata')
      fs.mkdirSync(userdataDir, { recursive: true })
      fs.writeFileSync(path.join(userdataDir, 'test.json'), '{"key":"value"}')

      const bm = getInstance()
      expect(() => bm.performBackup(0)).not.toThrow() // interval=0 means always backup

      // Check backup was created
      const backupDir = path.join(appDir, 'backup')
      expect(fs.existsSync(backupDir)).toBe(true)
    })
  })

  describe('getBackupList', () => {
    it('backup 目录不存在时返回空数组', () => {
      const bm = getInstance()
      expect(bm.getBackupList()).toEqual([])
    })

    it('backup 目录存在且有空备份目录时返回空', () => {
      const appDir = path.join(TEST_ROOT, 'fake-app')
      const backupDir = path.join(appDir, 'backup')
      fs.mkdirSync(backupDir, { recursive: true })

      const bm = getInstance()
      expect(bm.getBackupList()).toEqual([])
    })

    it('返回日期目录的备份列表（降序）', () => {
      const appDir = path.join(TEST_ROOT, 'fake-app')
      const backupDir = path.join(appDir, 'backup')
      fs.mkdirSync(path.join(backupDir, '2024-06-15'), { recursive: true })
      fs.mkdirSync(path.join(backupDir, '2024-06-16'), { recursive: true })
      fs.writeFileSync(path.join(backupDir, '2024-06-15', 'data.txt'), 'hello')
      fs.writeFileSync(path.join(backupDir, '2024-06-16', 'data.txt'), 'world')

      const bm = getInstance()
      const list = bm.getBackupList()
      expect(list.length).toBe(2)
      expect(list[0].date).toBe('2024-06-16')
      expect(list[1].date).toBe('2024-06-15')
      expect(list[0].size).toBeGreaterThan(0)
    })

    it('忽略非日期格式的目录', () => {
      const appDir = path.join(TEST_ROOT, 'fake-app')
      const backupDir = path.join(appDir, 'backup')
      fs.mkdirSync(path.join(backupDir, '2024-06-15'), { recursive: true })
      fs.mkdirSync(path.join(backupDir, 'not-a-date'), { recursive: true })

      const bm = getInstance()
      const list = bm.getBackupList()
      expect(list.length).toBe(1)
      expect(list[0].date).toBe('2024-06-15')
    })
  })

  describe('getNextBackupDate', () => {
    it('backupInterval <= 0 返回 null', () => {
      const bm = getInstance()
      expect(bm.getNextBackupDate(0)).toBeNull()
      expect(bm.getNextBackupDate(-1)).toBeNull()
    })

    it('从未备份过，返回今天', () => {
      const bm = getInstance()
      const result = bm.getNextBackupDate(7)
      expect(result).not.toBeNull()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('有最近备份时，返回 lastDate + interval', () => {
      const appDir = path.join(TEST_ROOT, 'fake-app')
      const backupDir = path.join(appDir, 'backup')
      // Create a backup dated 10 days ago
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
      const y = tenDaysAgo.getFullYear()
      const m = String(tenDaysAgo.getMonth() + 1).padStart(2, '0')
      const d = String(tenDaysAgo.getDate()).padStart(2, '0')
      const dateStr = `${y}-${m}-${d}`
      fs.mkdirSync(path.join(backupDir, dateStr), { recursive: true })

      const bm = getInstance()
      const result = bm.getNextBackupDate(7)
      // 10 days ago + 7 = 3 days ago, which is in the past, so should return today
      expect(result).not.toBeNull()
      // Since 10 days ago + 7 = 3 days ago <= today, should return today
      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      expect(result).toBe(todayStr)
    })
  })

  describe('restoreBackup', () => {
    it('备份不存在时返回失败', () => {
      const bm = getInstance()
      const result = bm.restoreBackup('2020-01-01')
      expect(result.success).toBe(false)
      expect(result.message).toContain('not found')
    })

    it('恢复已存在的备份', () => {
      const appDir = path.join(TEST_ROOT, 'fake-app')
      const backupDir = path.join(appDir, 'backup')
      const backupPath = path.join(backupDir, '2024-06-15')
      fs.mkdirSync(backupPath, { recursive: true })
      fs.writeFileSync(path.join(backupPath, 'data.txt'), 'restored data')

      const bm = getInstance()
      const result = bm.restoreBackup('2024-06-15')
      expect(result.success).toBe(true)

      // Check userdata was restored
      const userdataPath = path.join(appDir, 'userdata')
      expect(fs.existsSync(path.join(userdataPath, 'data.txt'))).toBe(true)
      expect(fs.readFileSync(path.join(userdataPath, 'data.txt'), 'utf8')).toBe('restored data')
    })
  })
})
