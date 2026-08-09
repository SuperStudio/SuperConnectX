/**
 * MonacoTheme - Monaco编辑器主题纯逻辑测试
 * 测试 theme 解析逻辑（不依赖 DOM）
 */
import { describe, it, expect } from 'vitest'

function resolveMonacoTheme(dataTheme: string | null): string {
  if (dataTheme === 'light') return 'vs'
  return 'vs-dark'
}

describe('getMonacoTheme (pure logic)', () => {
  it('should return vs-dark when data-theme is not set (null)', () => {
    expect(resolveMonacoTheme(null)).toBe('vs-dark')
  })

  it('should return vs when data-theme is "light"', () => {
    expect(resolveMonacoTheme('light')).toBe('vs')
  })

  it('should return vs-dark when data-theme is "dark"', () => {
    expect(resolveMonacoTheme('dark')).toBe('vs-dark')
  })

  it('should return vs-dark for any non-light theme', () => {
    expect(resolveMonacoTheme('system')).toBe('vs-dark')
    expect(resolveMonacoTheme('auto')).toBe('vs-dark')
  })

  it('should be case-sensitive (Light != light)', () => {
    expect(resolveMonacoTheme('Light')).toBe('vs-dark')
  })

  it('should return vs-dark for empty string', () => {
    expect(resolveMonacoTheme('')).toBe('vs-dark')
  })
})
