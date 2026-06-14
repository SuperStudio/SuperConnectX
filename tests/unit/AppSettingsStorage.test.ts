import { describe, it, expect, beforeEach } from 'vitest'
import AppSettingsStorage from '../../src/main/storage/AppSettingsStorage'

describe('AppSettingsStorage', () => {
  let storage: AppSettingsStorage

  beforeEach(() => {
    storage = new AppSettingsStorage()
  })

  describe('getSettings', () => {
    it('初始返回空对象', () => {
      const settings = storage.getSettings()
      expect(settings).toEqual({})
    })
  })

  describe('saveSettings', () => {
    it('保存 sidebar 设置', () => {
      storage.saveSettings({
        sidebar: {
          showConnectionList: true,
          serialPortExpanded: false,
          connectionGroupExpanded: {}
        }
      })
      const settings = storage.getSettings()
      expect(settings.sidebar!.showConnectionList).toBe(true)
      expect(settings.sidebar!.serialPortExpanded).toBe(false)
    })

    it('保存 terminalFontSize', () => {
      storage.saveSettings({ terminalFontSize: 16 })
      expect(storage.getSettings().terminalFontSize).toBe(16)
    })

    it('保存 settingsActiveCategory', () => {
      storage.saveSettings({ settingsActiveCategory: 'terminal' })
      expect(storage.getSettings().settingsActiveCategory).toBe('terminal')
    })

    it('保存 commandEditorSelectedGroupId', () => {
      const data = { telnet: 3, ssh: 1 }
      storage.saveSettings({ commandEditorSelectedGroupId: data })
      expect(storage.getSettings().commandEditorSelectedGroupId).toEqual(data)
    })

    it('保存 terminalWordWrap', () => {
      storage.saveSettings({ terminalWordWrap: true })
      expect(storage.getSettings().terminalWordWrap).toBe(true)
    })

    it('保存 terminalSyntaxGroupId', () => {
      const data = { 'conn-1': 1, 'conn-2': 2 }
      storage.saveSettings({ terminalSyntaxGroupId: data })
      expect(storage.getSettings().terminalSyntaxGroupId).toEqual(data)
    })

    it('部分保存不影响其他字段', () => {
      storage.saveSettings({ terminalFontSize: 20 })
      storage.saveSettings({ terminalWordWrap: false })
      expect(storage.getSettings().terminalFontSize).toBe(20)
      expect(storage.getSettings().terminalWordWrap).toBe(false)
    })

    it('覆盖已有字段', () => {
      storage.saveSettings({ terminalFontSize: 14 })
      storage.saveSettings({ terminalFontSize: 18 })
      expect(storage.getSettings().terminalFontSize).toBe(18)
    })
  })
})
