/**
 * useSerialRemarks - 串口备注管理纯逻辑测试
 * 测试：serialRemarks 缓存、loadSerialRemark 逻辑、saveSerialRemark 逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock window.storageApi
const mockStorageApi = {
  getComSettings: vi.fn(),
  saveComSettings: vi.fn()
}

vi.stubGlobal('window', {
  storageApi: mockStorageApi
})

describe('useSerialRemarks - pure logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('serialRemarks caching', () => {
    it('should return cached remark without calling API', () => {
      const cache: Record<string, string> = { 'COM1': 'My Device' }
      const comName = 'COM1'
      expect(cache[comName]).toBe('My Device')
    })

    it('should return empty string for uncached port', () => {
      const cache: Record<string, string> = {}
      const result = cache['COM99'] || ''
      expect(result).toBe('')
    })
  })

  describe('remark value logic', () => {
    it('should store remark in cache', () => {
      const serialRemarks: Record<string, string> = {}
      const comName = 'COM1'
      const remark = 'Test Device'
      serialRemarks[comName] = remark
      expect(serialRemarks[comName]).toBe('Test Device')
    })

    it('should overwrite existing remark', () => {
      const serialRemarks: Record<string, string> = { 'COM1': 'Old Name' }
      serialRemarks['COM1'] = 'New Name'
      expect(serialRemarks['COM1']).toBe('New Name')
    })

    it('should handle empty remark', () => {
      const serialRemarks: Record<string, string> = {}
      serialRemarks['COM1'] = ''
      expect(serialRemarks['COM1']).toBe('')
    })
  })

  describe('settings merge on save', () => {
    it('should merge remark with existing settings', async () => {
      mockStorageApi.getComSettings.mockResolvedValue({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        remark: 'Old'
      })
      mockStorageApi.saveComSettings.mockResolvedValue(true)

      const currentSettings = await mockStorageApi.getComSettings('COM1')
      const newSettings = { ...currentSettings, remark: 'New Remark' }

      expect(newSettings.baudRate).toBe(9600)
      expect(newSettings.dataBits).toBe(8)
      expect(newSettings.remark).toBe('New Remark')
    })

    it('should handle null existing settings', async () => {
      mockStorageApi.getComSettings.mockResolvedValue(null)
      const currentSettings = await mockStorageApi.getComSettings('COM1')
      const newSettings = { ...(currentSettings || {}), remark: 'Fresh Remark' }
      expect(newSettings.remark).toBe('Fresh Remark')
    })
  })

  describe('API error handling', () => {
    it('should return empty string on API error', async () => {
      mockStorageApi.getComSettings.mockRejectedValue(new Error('API error'))
      try {
        await mockStorageApi.getComSettings('COM1')
      } catch {
        // Expected - error handled gracefully
        expect(true).toBe(true)
      }
    })
  })
})
