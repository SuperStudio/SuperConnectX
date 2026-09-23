import type { CounterPayload } from '../shared/ipc/counter'

declare global {
  interface Window {
    /** Counter persistence API exposed by preload. */
    api: {
      counter: {
        get: () => Promise<CounterPayload>
        set: (payload: CounterPayload) => Promise<CounterPayload>
        reset: () => Promise<CounterPayload>
      }
    }
  }
}

export {}
