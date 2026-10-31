import { describe, it, expect } from 'vitest'
import {
  stringifySettings,
  parseSettingsJson,
  mergeSettingsWithDefaults,
  isSameSettings
} from '@/renderer/src/features/settings/jsonSettings'

describe('settings json helpers', () => {
  it('formats settings with a two space indent', () => {
    expect(stringifySettings({ language: 'zh-CN' })).toBe('{\n  "language": "zh-CN"\n}')
  })

  it('accepts a plain settings object', () => {
    const result = parseSettingsJson('{ "language": "en-US", "maxDisplayText": 50 }')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ language: 'en-US', maxDisplayText: 50 })
  })

  it('reports the offending line/column for malformed json', () => {
    const result = parseSettingsJson('{\n  "language": "zh-CN",\n}')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.line).toBe(3)
      expect(result.column).toBe(1)
      expect(result.error).toMatch(/at position 25/)
    }
  })

  it('derives line/column when the runtime only reports a character offset', () => {
    const result = parseSettingsJson('{ "language": "zh-CN" "maxDisplayText": 30 }')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.line).toBe(1)
      expect(result.column).toBe(23)
    }
  })

  it('falls back to the raw message when no position is available', () => {
    const result = parseSettingsJson('{\n  "maxDisplayText":\n}')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.line).toBeUndefined()
      expect(result.error.length).toBeGreaterThan(0)
    }
  })

  it('rejects non-object roots', () => {
    expect(parseSettingsJson('[]').ok).toBe(false)
    expect(parseSettingsJson('null').ok).toBe(false)
    expect(parseSettingsJson('"settings"').ok).toBe(false)
  })

  it('merges edited values over defaults and keeps untouched keys', () => {
    const merged = mergeSettingsWithDefaults({ language: 'zh-CN', autoBackup: true }, { language: 'en-US' })
    expect(merged).toEqual({ language: 'en-US', autoBackup: true })
  })

  it('works when defaults are not loaded yet', () => {
    expect(mergeSettingsWithDefaults(undefined, { language: 'en-US' })).toEqual({ language: 'en-US' })
  })

  it('compares settings structurally to avoid redundant writes', () => {
    expect(isSameSettings({ a: 1 }, { a: 1 })).toBe(true)
    expect(isSameSettings({ a: 1 }, { a: 2 })).toBe(false)
    expect(isSameSettings({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toBe(true)
  })
})
