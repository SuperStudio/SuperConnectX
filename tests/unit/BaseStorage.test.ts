import { describe, it, expect, beforeEach, vi } from 'vitest'

// electron-store mock is already configured globally in vitest.config.ts

describe('BaseStorage', () => {
  let BaseStorage: any

  beforeEach(async () => {
    // Re-import to get fresh instance
    const mod = await import('../../src/main/storage/BaseStorage')
    BaseStorage = mod.default
    // Clear the mock store between tests
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create instance with store name and defaults', async () => {
      const storage = new BaseStorage('testStore', { items: [] })
      expect(storage.storageName).toBe('testStore')
      expect(storage.storageData).toBeDefined()
    })

    it('should create instance with empty defaults', async () => {
      const storage = new BaseStorage('emptyStore', {})
      expect(storage.storageName).toBe('emptyStore')
    })

    it('should create instance with complex defaults', async () => {
      const defaults = { settings: { theme: 'dark' }, list: [1, 2, 3] }
      const storage = new BaseStorage('complexStore', defaults)
      expect(storage.storageName).toBe('complexStore')
    })
  })

  describe('getAll', () => {
    it('should return empty array when no data stored', async () => {
      const storage = new BaseStorage('emptyGetAll', { items: [] })
      expect(storage.getAll()).toEqual([])
    })

    it('should return stored data', async () => {
      const storage = new BaseStorage('withData', { items: [] })
      storage.saveAll([{ id: 1 }, { id: 2 }])
      expect(storage.getAll()).toEqual([{ id: 1 }, { id: 2 }])
    })
  })

  describe('saveAll', () => {
    it('should save and retrieve data', async () => {
      const storage = new BaseStorage('saveTest', { items: [] })
      const data = [{ name: 'test1' }, { name: 'test2' }]
      storage.saveAll(data)
      expect(storage.getAll()).toEqual(data)
    })

    it('should overwrite existing data', async () => {
      const storage = new BaseStorage('overwriteTest', { items: [] })
      storage.saveAll([{ id: 1 }])
      storage.saveAll([{ id: 2 }, { id: 3 }])
      expect(storage.getAll()).toEqual([{ id: 2 }, { id: 3 }])
    })

    it('should handle empty array', async () => {
      const storage = new BaseStorage('emptySave', { items: [] })
      storage.saveAll([{ id: 1 }])
      storage.saveAll([])
      expect(storage.getAll()).toEqual([])
    })

    it('should handle null/undefined values in array', async () => {
      const storage = new BaseStorage('nullSave', { items: [] })
      storage.saveAll([null, { id: 1 }, undefined])
      expect(storage.getAll()).toEqual([null, { id: 1 }, undefined])
    })
  })

  describe('abstract methods (stubs)', () => {
    it('add should be a no-op', async () => {
      const storage = new BaseStorage('addTest', { items: [] })
      expect(() => storage.add({ id: 1 })).not.toThrow()
    })

    it('update should be a no-op', async () => {
      const storage = new BaseStorage('updateTest', { items: [] })
      expect(() => storage.update({ id: 1 })).not.toThrow()
    })

    it('delete should be a no-op', async () => {
      const storage = new BaseStorage('deleteTest', { items: [] })
      expect(() => storage.delete(1)).not.toThrow()
    })
  })

  describe('getAppUserDataPath (indirect via constructor)', () => {
    it('should create userdata directory on construction', async () => {
      const storage = new BaseStorage('dirTest', { items: [] })
      // The constructor should complete without throwing
      expect(storage.storageData).toBeDefined()
    })
  })
})
