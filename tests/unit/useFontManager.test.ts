/**
 * useFontManager 测试
 * 测试字体管理器：字体获取、变更、字体大小变更
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue')
  return {
    ...actual as any
  }
})

vi.mock('../../src/renderer/src/utils/FontDetector', () => ({
  getDefaultTerminalFont: () => 'Consolas'
}))

import { useFontManager } from '../../src/renderer/src/composables/app/useFontManager'

describe('useFontManager', () => {
  let activeTabId: any
  let comTerminalRefs: Record<string, any>
  let telnetTerminalRefs: Record<string, any>

  beforeEach(() => {
    vi.clearAllMocks()
    activeTabId = ref('tab-1')
    comTerminalRefs = {}
    telnetTerminalRefs = {}
  })

  describe('initialization', () => {
    it('should return expected API', () => {
      const fm = useFontManager(activeTabId, comTerminalRefs, telnetTerminalRefs)
      expect(fm.currentFont).toBeDefined()
      expect(typeof fm.updateCurrentFont).toBe('function')
      expect(typeof fm.handleFontChange).toBe('function')
      expect(typeof fm.handleFontSizeChange).toBe('function')
    })

    it('should initialize with default terminal font', () => {
      const fm = useFontManager(activeTabId, comTerminalRefs, telnetTerminalRefs)
      expect(fm.currentFont.value).toBe('Consolas')
    })
  })

  describe('handleFontChange', () => {
    it('should update font on active com terminal', () => {
      const handleFontChange = vi.fn()
      comTerminalRefs = { 'tab-1': { handleFontChange } }
      const fm = useFontManager(activeTabId, comTerminalRefs, telnetTerminalRefs)

      fm.handleFontChange('Fira Code')
      expect(handleFontChange).toHaveBeenCalledWith('Fira Code')
      expect(fm.currentFont.value).toBe('Fira Code')
    })

    it('should update font on active telnet terminal', () => {
      const handleFontChange = vi.fn()
      telnetTerminalRefs = { 'tab-1': { handleFontChange } }
      const fm = useFontManager(activeTabId, comTerminalRefs, telnetTerminalRefs)

      fm.handleFontChange('JetBrains Mono')
      expect(handleFontChange).toHaveBeenCalledWith('JetBrains Mono')
    })

    it('should prefer com terminal over telnet when both exist', () => {
      const comHandle = vi.fn()
      const telnetHandle = vi.fn()
      comTerminalRefs = { 'tab-1': { handleFontChange: comHandle } }
      telnetTerminalRefs = { 'tab-1': { handleFontChange: telnetHandle } }
      const fm = useFontManager(activeTabId, comTerminalRefs, telnetTerminalRefs)

      fm.handleFontChange('Source Code Pro')
      expect(comHandle).toHaveBeenCalled()
      expect(telnetHandle).not.toHaveBeenCalled()
    })

    it('should not throw when no active tab', () => {
      activeTabId.value = ''
      const fm = useFontManager(activeTabId, comTerminalRefs, telnetTerminalRefs)

      expect(() => fm.handleFontChange('Any Font')).not.toThrow()
    })
  })

  describe('handleFontSizeChange', () => {
    it('should update font size on active com terminal', () => {
      const handleFontSizeChange = vi.fn()
      comTerminalRefs = { 'tab-1': { handleFontSizeChange } }
      const fm = useFontManager(activeTabId, comTerminalRefs, telnetTerminalRefs)

      fm.handleFontSizeChange('increase')
      expect(handleFontSizeChange).toHaveBeenCalledWith('increase')
    })

    it('should update font size on active telnet terminal', () => {
      const handleFontSizeChange = vi.fn()
      telnetTerminalRefs = { 'tab-1': { handleFontSizeChange } }
      const fm = useFontManager(activeTabId, comTerminalRefs, telnetTerminalRefs)

      fm.handleFontSizeChange('decrease')
      expect(handleFontSizeChange).toHaveBeenCalledWith('decrease')
    })

    it('should not throw when no active tab', () => {
      activeTabId.value = ''
      const fm = useFontManager(activeTabId, comTerminalRefs, telnetTerminalRefs)

      expect(() => fm.handleFontSizeChange('increase')).not.toThrow()
    })
  })

  describe('updateCurrentFont', () => {
    it('should update currentFont from terminal ref', () => {
      comTerminalRefs = { 'tab-1': { getFontFamily: () => 'Monaco' } }
      const fm = useFontManager(activeTabId, comTerminalRefs, telnetTerminalRefs)

      fm.updateCurrentFont('tab-1', 0)
      expect(fm.currentFont.value).toBe('Monaco')
    })

    it('should fall back to default font when ref not available', () => {
      const fm = useFontManager(activeTabId, comTerminalRefs, telnetTerminalRefs)

      // When no ref exists for this tabId, after retries it falls back
      fm.updateCurrentFont('nonexistent', 0)
      expect(fm.currentFont.value).toBe('Consolas')
    })

    it('should use telnet ref if com ref not available', () => {
      telnetTerminalRefs = { 'tab-2': { getFontFamily: () => 'Cascadia Code' } }
      const fm = useFontManager(activeTabId, comTerminalRefs, telnetTerminalRefs)

      fm.updateCurrentFont('tab-2', 0)
      expect(fm.currentFont.value).toBe('Cascadia Code')
    })
  })
})
