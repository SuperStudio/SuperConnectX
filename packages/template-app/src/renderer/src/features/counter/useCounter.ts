import { onMounted, ref } from 'vue'
import type { CounterPayload } from '../../../../shared/ipc/counter'

/**
 * Feature controller for the persistent counter panel.
 *
 * Demonstrates the IPC contract documented in preload/index.ts:
 *   - Read-side RPC (`get`) is a no-payload invoke, safe to call directly.
 *   - Write-side RPC (`set`) takes a payload; we always JSON-clone before
 *     passing it across the contextBridge boundary to avoid Proxy-clone
 *     errors. The reactive local mirror is then updated optimistically.
 */
export function useCounter() {
  const value = ref(0)
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)

  const refresh = async (): Promise<void> => {
    isLoading.value = true
    lastError.value = null
    try {
      const payload: CounterPayload = await window.api.counter.get()
      value.value = payload.value
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    } finally {
      isLoading.value = false
    }
  }

  const setValue = async (next: number): Promise<void> => {
    isLoading.value = true
    lastError.value = null
    const snapshot: CounterPayload = JSON.parse(JSON.stringify({ value: next })) as CounterPayload
    try {
      const result = await window.api.counter.set(snapshot)
      value.value = result.value
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    } finally {
      isLoading.value = false
    }
  }

  const increment = (): Promise<void> => setValue(value.value + 1)
  const reset = async (): Promise<void> => {
    isLoading.value = true
    try {
      const result: CounterPayload = await window.api.counter.reset()
      value.value = result.value
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    } finally {
      isLoading.value = false
    }
  }

  onMounted(refresh)

  return { value, isLoading, lastError, refresh, setValue, increment, reset }
}
