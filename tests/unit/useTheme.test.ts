import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTheme } from '../../src/renderer/src/foundation/theme/useTheme'

/**
 * useTheme 是少数直接访问浏览器 API 的 composable。
 * 单元测试运行在 node 环境，需要 mock localStorage 与 document.documentElement。
 */
class FakeStorage {
  private store = new Map<string, string>()
  clear(): void { this.store.clear() }
  getItem(key: string): string | null { return this.store.get(key) ?? null }
  setItem(key: string, value: string): void { this.store.set(key, value) }
  removeItem(key: string): void { this.store.delete(key) }
}

class FakeDataset {
  private attrs = new Map<string, string>()
  setAttribute(name: string, value: string): void { this.attrs.set(name, value) }
  removeAttribute(name: string): void { this.attrs.delete(name) }
  getAttribute(name: string): string | null { return this.attrs.get(name) ?? null }
}

describe('useTheme', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new FakeStorage())
    vi.stubGlobal('document', { documentElement: new FakeDataset() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('applies the default theme on creation when no preference exists', () => {
    const { theme } = useTheme({ storageKey: 'app-theme', defaultTheme: 'dark' })
    expect(theme.value).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('falls back to the default theme for invalid stored values', () => {
    localStorage.setItem('app-theme', 'rainbow')
    const { theme } = useTheme({ storageKey: 'app-theme', defaultTheme: 'dark' })
    expect(theme.value).toBe('dark')
  })

  it('restores the stored light theme', () => {
    localStorage.setItem('app-theme', 'light')
    const { theme } = useTheme({ storageKey: 'app-theme', defaultTheme: 'dark' })
    expect(theme.value).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('uses "dark" as the default when no default option is provided', () => {
    const { theme } = useTheme({ storageKey: 'app-theme' })
    expect(theme.value).toBe('dark')
  })

  it('toggleTheme flips dark to light and back', () => {
    const { theme, toggleTheme } = useTheme({ storageKey: 'app-theme', defaultTheme: 'dark' })
    expect(theme.value).toBe('dark')
    toggleTheme()
    expect(theme.value).toBe('light')
    expect(localStorage.getItem('app-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    toggleTheme()
    expect(theme.value).toBe('dark')
    expect(localStorage.getItem('app-theme')).toBe('dark')
  })

  it('applyTheme updates state, storage, and the document attribute', () => {
    const { theme, applyTheme } = useTheme({ storageKey: 'app-theme' })
    applyTheme('light')
    expect(theme.value).toBe('light')
    expect(localStorage.getItem('app-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('isolates state between instances using different storage keys', () => {
    const first = useTheme({ storageKey: 'theme-a', defaultTheme: 'dark' })
    const second = useTheme({ storageKey: 'theme-b', defaultTheme: 'light' })
    expect(first.theme.value).toBe('dark')
    expect(second.theme.value).toBe('light')
    first.applyTheme('light')
    expect(second.theme.value).toBe('light') // second not affected
  })

  it('persists the default theme into storage when no preference exists', () => {
    useTheme({ storageKey: 'app-theme', defaultTheme: 'dark' })
    expect(localStorage.getItem('app-theme')).toBe('dark')
  })
})