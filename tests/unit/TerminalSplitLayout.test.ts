import { describe, expect, it } from 'vitest'
import {
  MIN_TERMINAL_OUTPUT_HEIGHT,
  TERMINAL_SPLITTER_HEIGHT,
  calculateTerminalSplitRatio
} from '../../src/renderer/src/utils/TerminalSplitLayout'

describe('calculateTerminalSplitRatio', () => {
  it('uses the pointer position as a ratio of the current container', () => {
    expect(calculateTerminalSplitRatio(650, 50, 1000)).toBeCloseTo(0.6, 10)
  })

  it('keeps the terminal output above its minimum height', () => {
    const ratio = calculateTerminalSplitRatio(20, 0, 800)
    expect(ratio * 800).toBeCloseTo(MIN_TERMINAL_OUTPUT_HEIGHT, 10)
  })

  it('allows the bottom controls to shrink to an arbitrary height', () => {
    const containerHeight = 800
    const ratio = calculateTerminalSplitRatio(790, 0, containerHeight)
    const outputHeight = ratio * containerHeight

    expect(outputHeight).toBeCloseTo(790, 10)
    expect(containerHeight - TERMINAL_SPLITTER_HEIGHT - outputHeight).toBeCloseTo(4, 10)
  })

  it('keeps the splitter visible when dragged past the bottom edge', () => {
    const containerHeight = 800
    const ratio = calculateTerminalSplitRatio(900, 0, containerHeight)

    expect(ratio * containerHeight).toBeCloseTo(
      containerHeight - TERMINAL_SPLITTER_HEIGHT,
      10
    )
  })

  it('scales the split when the window size changes', () => {
    const ratio = calculateTerminalSplitRatio(500, 0, 1000)
    expect(ratio * 700).toBeCloseTo(350, 10)
  })

  it('handles an unavailable container safely', () => {
    expect(calculateTerminalSplitRatio(100, 0, 0)).toBe(0)
  })
})
