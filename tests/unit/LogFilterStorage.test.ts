import { describe, it, expect, beforeEach } from 'vitest'
import LogFilterStorage from '../../src/main/storage/LogFilterStorage'

describe('LogFilterStorage', () => {
  let storage: LogFilterStorage

  beforeEach(() => {
    storage = new LogFilterStorage()
  })

  describe('getSettings', () => {
    it('初始返回空对象', () => {
      const settings = storage.getSettings()
      expect(settings).toEqual({})
    })
  })

  describe('saveSettings', () => {
    it('保存正则表达式内容', () => {
      storage.saveSettings({ pattern: 'error|warning' })
      expect(storage.getSettings().pattern).toBe('error|warning')
    })

    it('保存面板宽度', () => {
      storage.saveSettings({ panelWidth: 480 })
      expect(storage.getSettings().panelWidth).toBe(480)
    })

    it('同时保存正则与面板宽度', () => {
      storage.saveSettings({ pattern: 'SEND', panelWidth: 420 })
      const settings = storage.getSettings()
      expect(settings.pattern).toBe('SEND')
      expect(settings.panelWidth).toBe(420)
    })

    it('部分保存不影响其他字段', () => {
      storage.saveSettings({ pattern: 'RECV', panelWidth: 360 })
      storage.saveSettings({ pattern: 'ERROR' })
      const settings = storage.getSettings()
      expect(settings.pattern).toBe('ERROR')
      expect(settings.panelWidth).toBe(360)
    })

    it('覆盖已有字段', () => {
      storage.saveSettings({ panelWidth: 300 })
      storage.saveSettings({ panelWidth: 500 })
      expect(storage.getSettings().panelWidth).toBe(500)
    })
  })
})
