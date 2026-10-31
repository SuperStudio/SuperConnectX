/**
 * Allowed notification display durations, in milliseconds.
 *
 * `0` means "permanent" — the notification stays until the user dismisses it
 * (see `useNotificationCenter`, which only arms a timer when duration > 0).
 */
export const NOTIFICATION_DURATIONS = [0, 1000, 3000, 5000] as const

export type NotificationDuration = (typeof NOTIFICATION_DURATIONS)[number]

/**
 * Validates a persisted display duration against the supported set.
 *
 * Stored settings come from disk and may contain legacy or hand-edited values,
 * so anything unknown falls back to the default (permanent) instead of being
 * handed to the timer as-is.
 */
export function normalizeNotificationDuration(value: unknown): NotificationDuration {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }
  return NOTIFICATION_DURATIONS.includes(value as NotificationDuration)
    ? (value as NotificationDuration)
    : 0
}
