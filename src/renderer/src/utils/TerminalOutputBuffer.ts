export const TERMINAL_FLUSH_INTERVAL_MS = 50
export const TERMINAL_IMMEDIATE_FLUSH_SIZE = 256 * 1024
export const TERMINAL_RETAIN_RATIO = 0.5

/**
 * 返回滚动裁剪后应从哪个字符偏移开始保留。
 * null 表示当前文本尚未超过限制。
 */
export function getRetainedOutputStartOffset(
  currentLength: number,
  maxLength: number,
  retainRatio = TERMINAL_RETAIN_RATIO
): number | null {
  if (currentLength <= maxLength) return null

  const normalizedLimit = Math.max(0, maxLength)
  const normalizedRatio = Math.min(1, Math.max(0, retainRatio))
  const retainedLength = Math.floor(normalizedLimit * normalizedRatio)
  return Math.max(0, currentLength - retainedLength)
}
