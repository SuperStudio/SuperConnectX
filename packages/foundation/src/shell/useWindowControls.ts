import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { WindowControlApi } from '@superx/shared/window'

/**
 * Binds custom-titlebar window controls to a preload bridge (WindowControlApi)
 * and tracks the maximize state so the titlebar can swap its restore/maximize icon.
 *
 * The host app supplies the bridge (e.g. `window.api.window`), keeping this
 * package free of any Electron import. Handlers can be passed straight to
 * WindowTitleBar's `minimize` / `toggleMaximize` / `close` events.
 */
export function useWindowControls(api: WindowControlApi): {
  isMaximized: Ref<boolean>
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
} {
  const isMaximized = ref(false)
  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    Promise.resolve(api.getMaximized()).then((maximized) => {
      isMaximized.value = maximized
    })
    unsubscribe = api.onMaximizedChanged((maximized) => {
      isMaximized.value = maximized
    })
  })

  onBeforeUnmount(() => {
    unsubscribe?.()
    unsubscribe = null
  })

  return {
    isMaximized,
    minimize: () => api.minimize(),
    toggleMaximize: () => api.toggleMaximize(),
    close: () => api.close()
  }
}
