import { describe, expect, it } from 'vitest'
import { formatReceivedData } from '../../src/renderer/src/features/terminal/useTerminalDisplayText'

describe('formatReceivedData', () => {
  it.each([
    ['first\nsecond', '[12:34:56] first\n[12:34:56] second\n'],
    ['first\r\nsecond', '[12:34:56] first\n[12:34:56] second\n'],
    ['first\rsecond', '[12:34:56] first\n[12:34:56] second\n']
  ])('adds the receive batch timestamp to each line in %j', (content, expected) => {
    expect(formatReceivedData(content, true, '12:34:56')).toBe(expected)
  })

  it('preserves blank lines when adding the batch timestamp', () => {
    expect(formatReceivedData('first\r\n\r\nthird', true, '12:34:56')).toBe(
      '[12:34:56] first\n[12:34:56] \n[12:34:56] third\n'
    )
  })

  it('does not add a timestamp-only line for a trailing line ending', () => {
    expect(formatReceivedData('first\r\n', true, '12:34:56')).toBe('[12:34:56] first\n')
  })

  it('preserves an intentional blank line before a trailing line ending', () => {
    expect(formatReceivedData('first\n\n', true, '12:34:56')).toBe('[12:34:56] first\n[12:34:56] \n')
  })

  it('does not turn an empty batch into a timestamp-only line', () => {
    expect(formatReceivedData('', true, '12:34:56')).toBe('\n')
  })

  it.each(['\n', '\r', '\r\n'])('does not turn a single line ending into a timestamp-only line: %j', content => {
    expect(formatReceivedData(content, true, '12:34:56')).toBe('\n')
  })

  it('keeps content layout unchanged when timestamps are disabled', () => {
    expect(formatReceivedData('first\r\n\rsecond', false, '12:34:56')).toBe('first\r\n\rsecond\n')
  })

  it('keeps the existing no-timestamp behavior when a timestamp is unavailable', () => {
    expect(formatReceivedData('first\nsecond', true)).toBe('first\nsecond\n')
  })
})
