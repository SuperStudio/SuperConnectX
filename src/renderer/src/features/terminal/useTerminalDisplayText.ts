import { ref } from 'vue'

const DEFAULT_SEND_DISPLAY_TEXT = 'SEND>>>>>>>>>>>>>'
const DEFAULT_RECV_DISPLAY_TEXT = ''

/** Shared terminal labels shown before outgoing and incoming terminal data. */
export const sendDisplayText = ref<string>(DEFAULT_SEND_DISPLAY_TEXT)
export const recvDisplayText = ref<string>(DEFAULT_RECV_DISPLAY_TEXT)

/** Loads persisted terminal display labels. */
export async function loadTerminalDisplayText(): Promise<void> {
  try {
    const settings = await window.storageApi.getSettings()
    updateSendDisplayText(settings?.sendDisplayText)
    updateRecvDisplayText(settings?.recvDisplayText)
  } catch {
    sendDisplayText.value = DEFAULT_SEND_DISPLAY_TEXT
    recvDisplayText.value = DEFAULT_RECV_DISPLAY_TEXT
  }
}

export function updateSendDisplayText(value: unknown): void {
  sendDisplayText.value = typeof value === 'string' && value.trim() ? value : DEFAULT_SEND_DISPLAY_TEXT
}

export function updateRecvDisplayText(value: unknown): void {
  recvDisplayText.value = typeof value === 'string' && value.trim() ? value : DEFAULT_RECV_DISPLAY_TEXT
}

/** Subscribes to the settings page's existing `settings-updated` browser event. */
export function initTerminalDisplayTextListener(): void {
  window.addEventListener('settings-updated', (event: Event) => {
    const settings = (event as CustomEvent).detail
    if (settings && typeof settings.sendDisplayText === 'string') updateSendDisplayText(settings.sendDisplayText)
    if (settings && typeof settings.recvDisplayText === 'string') updateRecvDisplayText(settings.recvDisplayText)
  })
}
