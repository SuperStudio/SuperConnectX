export const MIN_TERMINAL_OUTPUT_HEIGHT = 60
export const MIN_BOTTOM_CONTROLS_HEIGHT = 240
export const TERMINAL_SPLITTER_HEIGHT = 6

export function calculateTerminalSplitRatio(
  pointerY: number,
  containerTop: number,
  containerHeight: number
): number {
  if (containerHeight <= 0) return 0

  const availableHeight = Math.max(0, containerHeight - TERMINAL_SPLITTER_HEIGHT)
  const minOutputHeight = Math.min(MIN_TERMINAL_OUTPUT_HEIGHT, availableHeight)
  const maxOutputHeight = Math.max(minOutputHeight, availableHeight - MIN_BOTTOM_CONTROLS_HEIGHT)
  const requestedHeight = pointerY - containerTop
  const outputHeight = Math.min(maxOutputHeight, Math.max(minOutputHeight, requestedHeight))

  return outputHeight / containerHeight
}
