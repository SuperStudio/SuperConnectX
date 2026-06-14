import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatFontName, getSystemFonts } from '../../src/renderer/src/utils/FontDetector'

describe('FontDetector', () => {
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
