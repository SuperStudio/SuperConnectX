import { describe, expect, it } from 'vitest'
import { SettingsRegistry } from '../../src/renderer/src/foundation/settings/SettingsRegistry'

describe('SettingsRegistry', () => {
  it('returns categories ordered by their declared order', () => {
    const registry = new SettingsRegistry()
    registry.register({ key: 'advanced', getLabel: () => 'Advanced', order: 20 })
    registry.register({ key: 'basic', getLabel: () => 'Basic', order: 0 })

    expect(registry.getCategories()).toEqual([
      { key: 'basic', label: 'Basic' },
      { key: 'advanced', label: 'Advanced' }
    ])
  })

  it('resolves labels whenever categories are requested', () => {
    let locale = 'English'
    const registry = new SettingsRegistry()
    registry.register({ key: 'basic', getLabel: () => locale })

    expect(registry.getCategories()[0].label).toBe('English')
    locale = '中文'
    expect(registry.getCategories()[0].label).toBe('中文')
  })

  it('rejects duplicate category keys', () => {
    const registry = new SettingsRegistry()
    registry.register({ key: 'basic', getLabel: () => 'Basic' })

    expect(() => registry.register({ key: 'basic', getLabel: () => 'Other' }))
      .toThrow('already registered')
  })
})
