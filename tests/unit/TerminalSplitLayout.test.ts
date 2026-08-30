import { describe, expect, it } from 'vitest'
import {
  MIN_BOTTOM_CONTROLS_HEIGHT,
  MIN_TERMINAL_OUTPUT_HEIGHT,
  TERMINAL_SPLITTER_HEIGHT,
  calculateTerminalSplitRatio
} from '../../src/renderer/src/utils/TerminalSplitLayout'

describe('calculateTerminalSplitRatio', () => {
  it('uses the pointer position as a ratio of the current container', () => {
    expect(calculateTerminalSplitRatio(650, 50, 1000)).toBe(0.6)
  })

  it('keeps the terminal output above its minimum height', () => {
    const ratio = calculateTerminalSplitRatio(20, 0, 800)
    expect(ratio * 800).toBe(MIN_TERMINAL_OUTPUT_HEIGHT)
  })

  it('reserves enough room for the bottom controls and command input', () => {
    const containerHeight = 800
    const ratio = calculateTerminalSplitRatio(790, 0, containerHeight)
    const outputHeight = ratio * containerHeight

    expect(outputHeight).toBe(
      containerHeight - TERMINAL_SPLITTER_HEIGHT - MIN_BOTTOM_CONTROLS_HEIGHT
    )
  })

  it('scales the split when the window size changes', () => {
    const ratio = calculateTerminalSplitRatio(500, 0, 1000)
    expect(ratio * 700).toBe(350)
  })

  it('handles an unavailable container safely', () => {
    expect(calculateTerminalSplitRatio(100, 0, 0)).toBe(0)
  })
})
