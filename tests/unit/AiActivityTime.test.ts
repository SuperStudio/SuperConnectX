import { describe, expect, it } from 'vitest'
import { formatLocalTimestamp } from '../../src/renderer/src/extensions/ai-control/utils/formatLocalTimestamp'

describe('AI activity timestamp formatting', () => {
  it('formats stored UTC instants with the operating-system local timezone', () => {
    const localInstant = new Date(2026, 7, 24, 22, 54, 28, 555)
    expect(formatLocalTimestamp(localInstant.toISOString())).toBe('2026-08-24 22:54:28.555')
  })

  it('keeps an invalid timestamp visible instead of producing an invalid date', () => {
    expect(formatLocalTimestamp('unknown-time')).toBe('unknown-time')
  })
})
