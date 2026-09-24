/**
 * Single source of truth for IPC channel names shared between renderer and main.
 *
 * Channel strings must match exactly between the three sides:
 *   1. Renderer → window.apiName.invoke(CHANNEL.X)
 *   2. Preload   → ipcRenderer.invoke(CHANNEL.X)
 *   3. Main      → ipcMain.handle(CHANNEL.X, ...)
 */
export const COUNTER_CHANNEL = {
  GET: 'counter:get',
  INCREMENT: 'counter:increment',
  RESET: 'counter:reset'
} as const

export interface CounterPayload {
  value: number
}
