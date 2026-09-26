import { contextBridge, ipcRenderer } from 'electron'
import { COUNTER_CHANNEL, type CounterPayload } from '../shared/ipc/counter'
import { createWindowControlApi } from '@superx/shared/window'

/**
 * The single API surface exposed to the renderer.
 * Every method is a thin, typed wrapper around `ipcRenderer.invoke`.
 *
 * IMPORTANT — proxy serialization rule:
 *   Any object passed from the renderer into main MUST be deep-cloned before
 *   crossing the contextBridge boundary. Vue 3's `ref()` / `reactive()` wrap
 *   objects in Proxies, and Electron's IPC structured-clone algorithm cannot
 *   serialize Proxies (Error: "An object could not be cloned").
 *   The contract here is therefore:
 *     - INVOKE channels that accept payloads are wrapped with JSON-cloning
 *       inside the renderer feature layer (see features/counter/useCounter.ts).
 *     - Pure "no-argument" channels (no payload) are safe to call directly.
 */
const counterApi = {
  /** Returns the current persistent counter value. */
  get: (): Promise<CounterPayload> => ipcRenderer.invoke(COUNTER_CHANNEL.GET),

  /**
   * Persists a new counter value. The caller must pass a *plain* object —
   * see the JSON-clone rule in features/counter/useCounter.ts.
   */
  set: (payload: CounterPayload): Promise<CounterPayload> =>
    ipcRenderer.invoke(COUNTER_CHANNEL.INCREMENT, payload),

  /** Resets the counter back to zero. */
  reset: (): Promise<CounterPayload> => ipcRenderer.invoke(COUNTER_CHANNEL.RESET)
}

// 窗口控制桥接：实现全部在 @superx/shared/window 的工厂里，这里只注入 ipcRenderer
const api = { counter: counterApi, window: createWindowControlApi(ipcRenderer) }

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('[preload] Failed to expose API:', error)
}

export type Api = typeof api
