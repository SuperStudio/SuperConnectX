import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  formatFontName,
  getSystemFonts,
  getDefaultTerminalFont
} from '../../src/renderer/src/utils/FontDetector'

describe('FontDetector', () => {
  describe('getDefaultTerminalFont', () => {
    it('Windows 返回 Fira Code/Cascadia/Consolas 链', () => {
      const ua =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Electron/33.0.0'
      const font = getDefaultTerminalFont(ua)
      expect(font).toContain('Fira Code')
      expect(font).toContain('Cascadia Mono')
      expect(font).toContain('Consolas')
      expect(font).toContain('monospace')
    })

    it('macOS 返回 Fira Code/Menlo/Monaco 链', () => {
      const ua =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0.0.0 Electron/33.0.0'
      const font = getDefaultTerminalFont(ua)
      expect(font).toContain('Fira Code')
      expect(font).toContain('Menlo')
      expect(font).toContain('Monaco')
      expect(font).toContain('monospace')
    })

    it('Linux 返回 Fira Code/Ubuntu Mono/Noto CJK 链', () => {
      const ua =
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Electron/33.0.0'
      const font = getDefaultTerminalFont(ua)
      expect(font).toContain('Fira Code')
      expect(font).toContain('Ubuntu Mono')
      expect(font).toContain('Noto Sans Mono CJK SC')
      expect(font).toContain('DejaVu Sans Mono')
      expect(font).toContain('monospace')
      // Linux 链不应包含 Windows/macOS 专有字体
      expect(font).not.toContain('Consolas')
      expect(font).not.toContain('Menlo')
    })
  })

  describe('formatFontName', () => {
    it('映射已知字体名称', () => {
      expect(formatFontName('SimSun')).toBe('宋体')
      expect(formatFontName('SimHei')).toBe('黑体')
      expect(formatFontName('Microsoft YaHei')).toBe('微软雅黑')
      expect(formatFontName('Microsoft JhengHei')).toBe('微软正黑')
    })

    it('映射 PingFang 系列', () => {
      expect(formatFontName('PingFang SC')).toBe('苹方-简')
      expect(formatFontName('PingFang TC')).toBe('苹方-繁')
    })

    it('映射思源系列', () => {
      expect(formatFontName('Source Han Sans SC')).toBe('思源黑体-简')
      expect(formatFontName('Source Han Serif SC')).toBe('思源宋体-简')
      expect(formatFontName('Source Han Mono')).toBe('思源等宽')
    })

    it('映射文泉驿系列', () => {
      expect(formatFontName('WenQuanYi Micro Hei')).toBe('文泉驿微米黑')
      expect(formatFontName('WenQuanYi Micro Hei Mono')).toBe('文泉驿等宽微米黑')
    })

    it('映射其他中文字体', () => {
      expect(formatFontName('FangSong')).toBe('仿宋')
      expect(formatFontName('KaiTi')).toBe('楷体')
    })

    it('未知字体返回原名', () => {
      expect(formatFontName('Consolas')).toBe('Consolas')
      expect(formatFontName('Fira Code')).toBe('Fira Code')
      expect(formatFontName('SomeUnknownFont')).toBe('SomeUnknownFont')
    })

    it('空字符串返回空字符串', () => {
      expect(formatFontName('')).toBe('')
    })
  })

  describe('getSystemFonts', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('当 queryLocalFonts 可用时返回字体列表', async () => {
      const mockFonts = [
        { family: 'Consolas' },
        { family: 'Fira Code' },
        { family: 'Arial' }
      ]

      // Mock document
      const addEventListener = vi.fn()
      Object.defineProperty(globalThis, 'document', {
        value: {
          visibilityState: 'visible',
          addEventListener,
          removeEventListener: vi.fn()
        },
        writable: true,
        configurable: true
      })

      // Mock window.queryLocalFonts
      Object.defineProperty(globalThis, 'window', {
        value: {
          queryLocalFonts: vi.fn().mockResolvedValue(mockFonts)
        },
        writable: true,
        configurable: true
      })

      const fonts = await getSystemFonts()
      expect(fonts.length).toBeGreaterThan(0)
      expect(fonts).toContain('Arial')
      expect(fonts).toContain('Consolas')
      // Should include default fonts too
      expect(fonts).toContain('SimHei')
    })

    it('当 queryLocalFonts 失败时返回默认字体列表', async () => {
      const addEventListener = vi.fn()
      Object.defineProperty(globalThis, 'document', {
        value: {
          visibilityState: 'visible',
          addEventListener,
          removeEventListener: vi.fn()
        },
        writable: true,
        configurable: true
      })

      Object.defineProperty(globalThis, 'window', {
        value: {
          queryLocalFonts: vi.fn().mockRejectedValue(new Error('Not available'))
        },
        writable: true,
        configurable: true
      })

      const fonts = await getSystemFonts()
      expect(fonts.length).toBeGreaterThan(0)
      expect(fonts).toContain('Consolas')
      expect(fonts).toContain('SimHei')
    })
  })
})
