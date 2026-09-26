import type { CounterPayload } from '../shared/ipc/counter'
import type { WindowControlApi } from '@superx/shared/window'

declare global {
  interface Window {
    /** Counter persistence API exposed by preload. */
    api: {
      counter: {
        get: () => Promise<CounterPayload>
        set: (payload: CounterPayload) => Promise<CounterPayload>
        reset: () => Promise<CounterPayload>
      }
      /** Window controls for the custom titlebar (see @superx/shared/window). */
      window: WindowControlApi
    }
  }
}

export {}
