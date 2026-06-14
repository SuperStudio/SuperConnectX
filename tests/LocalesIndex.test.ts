import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('locales/index', () => {
  let localStorageMock: Record<string, string>

  beforeEach(() => {
    localStorageMock = {}

    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageMock[key] = value
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageMock[key]
      })
    })

    vi.stubGlobal('navigator', {
      language: 'en-US'
    })

    // Reset module cache so each test gets fresh import
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('availableLocales', () => {
    it('should have zh-CN and en-US', async () => {
      const { availableLocales } = await import('../src/renderer/src/locales/index')
      expect(availableLocales).toHaveLength(2)
      expect(availableLocales[0]).toEqual({ value: 'zh-CN', label: '简体中文' })
      expect(availableLocales[1]).toEqual({ value: 'en-US', label: 'English' })
    })
  })

  describe('default locale detection', () => {
    it('should use en-US as default when no locale saved', async () => {
      const { i18n } = await import('../src/renderer/src/locales/index')
      expect(i18n.global.locale.value).toBe('en-US')
    })

    it('should fallback to en-US for unknown browser language', async () => {
      vi.stubGlobal('navigator', { language: 'ja-JP' })
      const { i18n } = await import('../src/renderer/src/locales/index')
      expect(i18n.global.locale.value).toBe('en-US')
    })
  })

  describe('setLocale', () => {
    it('should save locale to localStorage and update i18n', async () => {
      const { setLocale, i18n } = await import('../src/renderer/src/locales/index')

      setLocale('zh-CN')
      expect(localStorageMock['locale']).toBe('zh-CN')
      expect(i18n.global.locale.value).toBe('zh-CN')

      setLocale('en-US')
      expect(localStorageMock['locale']).toBe('en-US')
      expect(i18n.global.locale.value).toBe('en-US')
    })
  })

  describe('fallback locale', () => {
    it('should have en-US as fallback', async () => {
      const { i18n } = await import('../src/renderer/src/locales/index')
      expect(i18n.global.fallbackLocale.value).toBe('en-US')
    })
  })
})
