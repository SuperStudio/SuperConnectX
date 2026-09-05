import { ref, type Ref } from 'vue'

/**
 * Keeps the vertical split ratio isolated to each mounted terminal instance.
 * This belongs to the terminal feature because its lifecycle follows terminal tabs.
 */
export function useTerminalPanelLayout(): {
  terminalOutputRatio: Ref<number | null>
} {
  return { terminalOutputRatio: ref<number | null>(null) }
}
