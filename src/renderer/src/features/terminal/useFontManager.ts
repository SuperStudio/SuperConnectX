import { ref, watch, nextTick, type Ref } from 'vue'
import { getDefaultTerminalFont } from '../../utils/FontDetector'

/** Terminal methods required for toolbar font actions. */
export interface TerminalFontRef {
  getFontFamily?: () => string
  handleFontChange?: (fontFamily: string) => void
  handleFontSizeChange?: (action: string) => void
}

/** Coordinates the terminal font controls with the terminal in the active tab. */
export function useFontManager(
  activeTabId: Ref<string>,
  comTerminalRefs: Record<string, TerminalFontRef>,
  telnetTerminalRefs: Record<string, TerminalFontRef>
) {
  const currentFont = ref(getDefaultTerminalFont())

  const updateCurrentFont = (tabId: string, retries = 5) => {
    const tryGetFont = () => {
      const terminal = comTerminalRefs[tabId] || telnetTerminalRefs[tabId]
      const font = terminal?.getFontFamily?.()
      if (!font) return false
      currentFont.value = font
      return true
    }

    if (tryGetFont()) return

    let retryCount = 0
    const retry = () => {
      retryCount++
      if (tryGetFont()) return
      if (retryCount < retries) {
        setTimeout(retry, 100)
      } else {
        currentFont.value = getDefaultTerminalFont()
      }
    }
    setTimeout(retry, 100)
  }

  watch(activeTabId, (newTabId, oldTabId) => {
    if (newTabId && newTabId !== oldTabId) nextTick(() => updateCurrentFont(newTabId))
  })

  const handleFontChange = (fontFamily: string) => {
    const tabId = activeTabId.value
    if (!tabId) return

    const terminal = comTerminalRefs[tabId] || telnetTerminalRefs[tabId]
    terminal?.handleFontChange?.(fontFamily)
    currentFont.value = fontFamily
  }

  const handleFontSizeChange = (action: string) => {
    const tabId = activeTabId.value
    if (!tabId) return

    const terminal = comTerminalRefs[tabId] || telnetTerminalRefs[tabId]
    terminal?.handleFontSizeChange?.(action)
  }

  return { currentFont, updateCurrentFont, handleFontChange, handleFontSizeChange }
}
