/**
 * useFontManager - 字体管理
 * 管理：当前活动字体获取、字体/字体大小变更
 */
import { ref, watch, nextTick } from 'vue'
import { getDefaultTerminalFont } from '../../utils/FontDetector'

export function useFontManager(
  activeTabId: any,
  comTerminalRefs: Record<string, any>,
  telnetTerminalRefs: Record<string, any>
) {
  const currentFont = ref(getDefaultTerminalFont())

  const updateCurrentFont = (tabId: string, retries = 5) => {
    const tryGetFont = () => {
      const comRef = comTerminalRefs[tabId]
      const telnetRef = telnetTerminalRefs[tabId]
      if (comRef || telnetRef) {
        const ref = comRef || telnetRef
        const font = ref?.getFontFamily?.()
        if (font) { currentFont.value = font; return true }
      }
      return false
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

  // 监听 activeTabId 变化，更新字体
  watch(activeTabId, (newTabId: string, oldTabId: string) => {
    if (newTabId && newTabId !== oldTabId) {
      nextTick(() => updateCurrentFont(newTabId))
    }
  })

  const handleFontChange = (fontFamily: string) => {
    if (activeTabId.value) {
      const tabId = activeTabId.value
      if (comTerminalRefs[tabId]) {
        comTerminalRefs[tabId]?.handleFontChange?.(fontFamily)
      } else {
        telnetTerminalRefs[tabId]?.handleFontChange(fontFamily)
      }
      currentFont.value = fontFamily
    }
  }

  const handleFontSizeChange = (action: string) => {
    if (activeTabId.value) {
      const tabId = activeTabId.value
      if (comTerminalRefs[tabId]) {
        comTerminalRefs[tabId]?.handleFontSizeChange?.(action)
      } else {
        telnetTerminalRefs[tabId]?.handleFontSizeChange(action)
      }
    }
  }

  return {
    currentFont,
    updateCurrentFont,
    handleFontChange,
    handleFontSizeChange
  }
}
