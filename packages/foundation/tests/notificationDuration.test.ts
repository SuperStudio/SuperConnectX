import { describe, expect, it } from 'vitest'
import {
  NOTIFICATION_DURATIONS,
  normalizeNotificationDuration
} from '../src/shell/notificationDuration'

describe('notificationDuration', () => {
  it('should expose permanent plus 1s/3s/5s options', () => {
    expect([...NOTIFICATION_DURATIONS]).toEqual([0, 1000, 3000, 5000])
  })

  it.each([0, 1000, 3000, 5000])('should keep supported value %i', (value) => {
    expect(normalizeNotificationDuration(value)).toBe(value)
  })

  it('should fall back to permanent for unknown values', () => {
    expect(normalizeNotificationDuration(2000)).toBe(0)
    expect(normalizeNotificationDuration(7000)).toBe(0)
  })

  it('should fall back to permanent for invalid values', () => {
    expect(normalizeNotificationDuration(undefined)).toBe(0)
    expect(normalizeNotificationDuration(null)).toBe(0)
    expect(normalizeNotificationDuration(-1)).toBe(0)
    expect(normalizeNotificationDuration(NaN)).toBe(0)
    expect(normalizeNotificationDuration(Infinity)).toBe(0)
    expect(normalizeNotificationDuration('3000')).toBe(0)
    expect(normalizeNotificationDuration({})).toBe(0)
  })
})
