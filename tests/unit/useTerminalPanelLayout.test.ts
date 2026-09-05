import { describe, expect, it } from 'vitest'
import { useTerminalPanelLayout } from '../../src/renderer/src/features/terminal/useTerminalPanelLayout'

describe('useTerminalPanelLayout', () => {
  it('keeps the dragged split ratio independent for every terminal', () => {
    const firstTerminal = useTerminalPanelLayout()
    const secondTerminal = useTerminalPanelLayout()

    firstTerminal.terminalOutputRatio.value = 0.82

    expect(firstTerminal.terminalOutputRatio.value).toBe(0.82)
    expect(secondTerminal.terminalOutputRatio.value).toBeNull()

    secondTerminal.terminalOutputRatio.value = 0.55
    expect(firstTerminal.terminalOutputRatio.value).toBe(0.82)
    expect(secondTerminal.terminalOutputRatio.value).toBe(0.55)
  })

  it('retains a terminal ratio without module-level shared state', () => {
    const terminal = useTerminalPanelLayout()
    terminal.terminalOutputRatio.value = 0.7

    expect(terminal.terminalOutputRatio.value).toBe(0.7)
  })
})
