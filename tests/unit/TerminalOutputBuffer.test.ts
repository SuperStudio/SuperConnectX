import { describe, expect, it } from 'vitest'
import { getRetainedOutputStartOffset } from '../../src/renderer/src/utils/TerminalOutputBuffer'

describe('getRetainedOutputStartOffset', () => {
  it('does not trim content below the limit', () => {
    expect(getRetainedOutputStartOffset(100, 100)).toBeNull()
    expect(getRetainedOutputStartOffset(99, 100)).toBeNull()
  })

  it('retains the newest half by default', () => {
    expect(getRetainedOutputStartOffset(140, 100)).toBe(90)
  })

  it('clamps invalid retain ratios', () => {
    expect(getRetainedOutputStartOffset(140, 100, -1)).toBe(140)
    expect(getRetainedOutputStartOffset(140, 100, 2)).toBe(40)
  })
})
