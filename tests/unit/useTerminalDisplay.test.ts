/**
 * useTerminalDisplay 测试
 * 测试终端显示设置：换行、行号、日志可编辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStorageApi = {
  getAppSettings: vi.fn().mockResolvedValue({}),
  saveAppSettings: vi.fn().mockResolvedValue({})
}
;(globalThis as any).window = { storageApi: mockStorageApi }

import { useTerminalDisplay } from '../../src/renderer/src/composables/app/useTerminalDisplay'

describe('useTerminalDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should return expected API', () => {
      const display = useTerminalDisplay()
      expect(display.terminalWordWrap).toBeDefined()
      expect(display.terminalLineNumbers).toBeDefined()
      expect(display.terminalLogEditable).toBeDefined()
      expect(typeof display.loadTerminalDisplaySettings).toBe('function')
      expect(typeof display.saveTerminalDisplaySettings).toBe('function')
      expect(typeof display.applyToAllTerminals).toBe('function')
      expect(typeof display.applyTerminalDisplaySettingsToTab).toBe('function')
    })

    it('should have wordWrap false by default', () => {
      const display = useTerminalDisplay()
      expect(display.terminalWordWrap.value).toBe(false)
    })

    it('should have lineNumbers true by default', () => {
      const display = useTerminalDisplay()
      expect(display.terminalLineNumbers.value).toBe(true)
    })

    it('should have logEditable false by default', () => {
      const display = useTerminalDisplay()
      expect(display.terminalLogEditable.value).toBe(false)
    })
  })

  describe('loadTerminalDisplaySettings', () => {
    it('should load settings from storage', async () => {
      mockStorageApi.getAppSettings.mockResolvedValueOnce({
        terminalWordWrap: true,
        terminalLineNumbers: false,
        terminalLogEditable: true
      })
      const display = useTerminalDisplay()

      await display.loadTerminalDisplaySettings()
      expect(display.terminalWordWrap.value).toBe(true)
      expect(display.terminalLineNumbers.value).toBe(false)
      expect(display.terminalLogEditable.value).toBe(true)
    })

    it('should keep defaults when settings not available', async () => {
      mockStorageApi.getAppSettings.mockResolvedValueOnce({})
      const display = useTerminalDisplay()

      await display.loadTerminalDisplaySettings()
      expect(display.terminalWordWrap.value).toBe(false)
      expect(display.terminalLineNumbers.value).toBe(true)
      expect(display.terminalLogEditable.value).toBe(false)
    })

    it('should handle API errors gracefully', async () => {
      mockStorageApi.getAppSettings.mockRejectedValueOnce(new Error('Failed'))
      const display = useTerminalDisplay()

      await expect(display.loadTerminalDisplaySettings()).resolves.not.toThrow()
    })

    it('should only load defined settings', async () => {
      mockStorageApi.getAppSettings.mockResolvedValueOnce({
        terminalWordWrap: true
        // terminalLineNumbers and terminalLogEditable not in response
      })
      const display = useTerminalDisplay()

      await display.loadTerminalDisplaySettings()
      expect(display.terminalWordWrap.value).toBe(true)
      expect(display.terminalLineNumbers.value).toBe(true) // default
      expect(display.terminalLogEditable.value).toBe(false) // default
    })
  })

  describe('saveTerminalDisplaySettings', () => {
    it('should save current settings merged with existing', async () => {
      mockStorageApi.getAppSettings.mockResolvedValueOnce({ existingKey: 'value' })
      const display = useTerminalDisplay()
      display.terminalWordWrap.value = true

      await display.saveTerminalDisplaySettings()
      expect(mockStorageApi.saveAppSettings).toHaveBeenCalledWith({
        existingKey: 'value',
        terminalWordWrap: true,
        terminalLineNumbers: true,
        terminalLogEditable: false
      })
    })

    it('should handle save errors gracefully', async () => {
      mockStorageApi.getAppSettings.mockRejectedValueOnce(new Error('Failed'))
      const display = useTerminalDisplay()

      await expect(display.saveTerminalDisplaySettings()).resolves.not.toThrow()
    })
  })

  describe('applyToAllTerminals', () => {
    it('should call method on all com terminals', () => {
      const setWordWrap = vi.fn()
      const comRefs = {
        'tab-1': { setWordWrap },
        'tab-2': { setWordWrap: vi.fn() }
      }
      const telnetRefs: Record<string, any> = {}
      const display = useTerminalDisplay()
      const tabs = [
        { id: 'tab-1', connectionType: 'com' },
        { id: 'tab-2', connectionType: 'com' }
      ]

      display.applyToAllTerminals(tabs, comRefs, telnetRefs, 'setWordWrap', true)
      expect(comRefs['tab-1'].setWordWrap).toHaveBeenCalledWith(true)
      expect(comRefs['tab-2'].setWordWrap).toHaveBeenCalledWith(true)
    })

    it('should call method on telnet terminals', () => {
      const setLineNumbers = vi.fn()
      const comRefs: Record<string, any> = {}
      const telnetRefs = { 'tab-1': { setLineNumbers } }
      const display = useTerminalDisplay()
      const tabs = [{ id: 'tab-1', connectionType: 'telnet' }]

      display.applyToAllTerminals(tabs, comRefs, telnetRefs, 'setLineNumbers', false)
      expect(setLineNumbers).toHaveBeenCalledWith(false)
    })

    it('should handle missing terminal refs gracefully', () => {
      const display = useTerminalDisplay()
      const tabs = [{ id: 'nonexistent', connectionType: 'com' }]

      expect(() => {
        display.applyToAllTerminals(tabs, {}, {}, 'setWordWrap', true)
      }).not.toThrow()
    })

    it('should handle missing method gracefully', () => {
      const display = useTerminalDisplay()
      const comRefs = { 'tab-1': {} } // no setWordWrap method
      const tabs = [{ id: 'tab-1', connectionType: 'com' }]

      expect(() => {
        display.applyToAllTerminals(tabs, comRefs, {}, 'setWordWrap', true)
      }).not.toThrow()
    })
  })

  describe('applyTerminalDisplaySettingsToTab', () => {
    it('should apply all settings to a specific tab', () => {
      const setWordWrap = vi.fn()
      const setLineNumbers = vi.fn()
      const setLogEditable = vi.fn()
      const comRefs = {
        'tab-1': { setWordWrap, setLineNumbers, setLogEditable }
      }
      const display = useTerminalDisplay()
      display.terminalWordWrap.value = true
      display.terminalLineNumbers.value = false
      display.terminalLogEditable.value = true

      display.applyTerminalDisplaySettingsToTab('tab-1', comRefs, {})
      expect(setWordWrap).toHaveBeenCalledWith(true)
      expect(setLineNumbers).toHaveBeenCalledWith(false)
      expect(setLogEditable).toHaveBeenCalledWith(true)
    })

    it('should prefer com ref over telnet ref', () => {
      const comSet = vi.fn()
      const telnetSet = vi.fn()
      const comRefs = { 'tab-1': { setWordWrap: comSet } }
      const telnetRefs = { 'tab-1': { setWordWrap: telnetSet } }
      const display = useTerminalDisplay()

      display.applyTerminalDisplaySettingsToTab('tab-1', comRefs, telnetRefs)
      expect(comSet).toHaveBeenCalled()
      expect(telnetSet).not.toHaveBeenCalled()
    })

    it('should use telnet ref when com ref not available', () => {
      const telnetSet = vi.fn()
      const telnetRefs = { 'tab-1': { setWordWrap: telnetSet } }
      const display = useTerminalDisplay()

      display.applyTerminalDisplaySettingsToTab('tab-1', {}, telnetRefs)
      expect(telnetSet).toHaveBeenCalled()
    })

    it('should not throw when tab refs not found', () => {
      const display = useTerminalDisplay()
      expect(() => {
        display.applyTerminalDisplaySettingsToTab('unknown', {}, {})
      }).not.toThrow()
    })
  })
})
