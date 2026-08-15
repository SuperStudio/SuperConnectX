/**
 * useSettingsStore - 全局共享设置
 * 目前用于终端「发送命令显示文本」和「接收命令显示文本」的响应式共享：
 * - 首次从后端读取持久化的设置
 * - 监听 settings-updated 事件，设置页保存后实时更新
 */
import { ref } from 'vue'

const DEFAULT_SEND_DISPLAY_TEXT = 'SEND>>>>>>>>>>>>>'
const DEFAULT_RECV_DISPLAY_TEXT = ''

/** 发送命令时终端显示的文本前缀 */
export const sendDisplayText = ref<string>(DEFAULT_SEND_DISPLAY_TEXT)

/** 接收数据时终端显示的文本前缀 */
export const recvDisplayText = ref<string>(DEFAULT_RECV_DISPLAY_TEXT)

/** 从后端读取发送/接收显示文本设置 */
export async function loadSendDisplayText(): Promise<void> {
  try {
    const settings = await window.storageApi.getSettings()
    if (settings && typeof settings.sendDisplayText === 'string' && settings.sendDisplayText.trim()) {
      sendDisplayText.value = settings.sendDisplayText
    } else {
      sendDisplayText.value = DEFAULT_SEND_DISPLAY_TEXT
    }
    if (settings && typeof settings.recvDisplayText === 'string' && settings.recvDisplayText.trim()) {
      recvDisplayText.value = settings.recvDisplayText
    } else {
      recvDisplayText.value = DEFAULT_RECV_DISPLAY_TEXT
    }
  } catch {
    // 读取失败时使用默认值
    sendDisplayText.value = DEFAULT_SEND_DISPLAY_TEXT
    recvDisplayText.value = DEFAULT_RECV_DISPLAY_TEXT
  }
}

/** 更新发送显示文本（由设置页保存时同步调用） */
export function updateSendDisplayText(value: string): void {
  sendDisplayText.value = value && value.trim() ? value : DEFAULT_SEND_DISPLAY_TEXT
}

/** 更新接收显示文本（由设置页保存时同步调用） */
export function updateRecvDisplayText(value: string): void {
  recvDisplayText.value = value && value.trim() ? value : DEFAULT_RECV_DISPLAY_TEXT
}

/** 订阅 settings-updated 事件，实时更新发送/接收显示文本 */
export function initSendDisplayTextListener(): void {
  window.addEventListener('settings-updated', (event: Event) => {
    const settings = (event as CustomEvent).detail
    if (settings && typeof settings.sendDisplayText === 'string') {
      updateSendDisplayText(settings.sendDisplayText)
    }
    if (settings && typeof settings.recvDisplayText === 'string') {
      updateRecvDisplayText(settings.recvDisplayText)
    }
  })
}
