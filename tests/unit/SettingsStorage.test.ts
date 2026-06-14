import { describe, it, expect, beforeEach } from 'vitest'
import SettingsStorage from '../../src/main/storage/SettingsStorage'

describe('SettingsStorage', () => {
  let storage: SettingsStorage

  beforeEach(() => {
    storage = new SettingsStorage()
  })

  describe('getSettings', () => {
    it('返回默认设置', () => {
      const settings = storage.getSettings()
      expect(settings.minimizeToTray).toBe(false)
      expect(settings.autoScroll).toBe(true)
      expect(settings.language).toBe('zh-CN')
      expect(settings.backupInterval).toBe(30)
      expect(settings.maxDisplayText).toBe(30)
    })

    it('返回日志相关默认设置', () => {
      const settings = storage.getSettings()
      expect(settings.enableLogStorage).toBe(true)
      expect(settings.logSplitSize).toBe(20)
      expect(settings.logFileName).toBe('%C-%Y-%M-%D-%hh-%mm-%ss')
      expect(settings.maxLogSize).toBe(50)
      expect(settings.logTimestamp).toBe(true)
      expect(settings.logHex).toBe(false)
    })

    it('返回串口默认设置', () => {
      const settings = storage.getSettings()
      expect(settings.supportedBaudRates).toEqual([9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1500000])
      expect(settings.showPortType).toBe(true)
    })

    it('返回语法高亮默认设置', () => {
      const settings = storage.getSettings()
      expect(settings.enableSyntaxHighlight).toBe(true)
      expect(settings.syntaxRuleGroups!.length).toBeGreaterThan(0)
    })

    it('返回搜索默认设置', () => {
      const settings = storage.getSettings()
      expect(settings.searchCaseSensitive).toBe(false)
      expect(settings.searchRegex).toBe(false)
      expect(settings.searchWholeWord).toBe(false)
    })

    it('返回命令历史默认设置', () => {
      const settings = storage.getSettings()
      expect(settings.commandHistoryMaxCount).toBe(10)
      expect(settings.showCommandHistory).toBe(true)
    })
  })

  describe('saveSettings', () => {
    it('保存并读取自定义设置', () => {
      storage.saveSettings({ language: 'en-US', autoScroll: false })
      const settings = storage.getSettings()
      expect(settings.language).toBe('en-US')
      expect(settings.autoScroll).toBe(false)
    })

    it('部分保存不影响其他设置', () => {
      storage.saveSettings({ language: 'ja-JP' })
      const settings = storage.getSettings()
      expect(settings.language).toBe('ja-JP')
      expect(settings.autoScroll).toBe(true) // 未修改
    })

    it('保存 backupInterval', () => {
      storage.saveSettings({ backupInterval: 7 })
      expect(storage.getSettings().backupInterval).toBe(7)
    })

    it('保存 commandHistoryMaxCount', () => {
      storage.saveSettings({ commandHistoryMaxCount: 20 })
      expect(storage.getSettings().commandHistoryMaxCount).toBe(20)
    })

    it('保存语法高亮组', () => {
      storage.saveSettings({
        syntaxRuleGroups: [{ id: 99, name: 'Custom', subRules: [] }]
      })
      const settings = storage.getSettings()
      expect(settings.syntaxRuleGroups!.length).toBe(1)
      expect(settings.syntaxRuleGroups![0].name).toBe('Custom')
    })
  })

  describe('getDefaults', () => {
    it('返回默认设置的副本', () => {
      const defaults = storage.getDefaults()
      expect(defaults.autoScroll).toBe(true)
      // 修改副本不影响存储
      defaults.autoScroll = false
      expect(storage.getSettings().autoScroll).toBe(true)
    })
  })
})
