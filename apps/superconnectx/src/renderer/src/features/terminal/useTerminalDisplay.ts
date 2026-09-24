import { ref } from 'vue'

/** SuperConnectX-wide terminal presentation preferences and their application to open terminal tabs. */
export function useTerminalDisplay() {
  const terminalWordWrap = ref(false)
  const terminalLineNumbers = ref(true)
  const terminalLogEditable = ref(false)

  const loadTerminalDisplaySettings = async () => {
    try {
      const appSettings = await window.storageApi.getAppSettings()
      if (appSettings?.terminalWordWrap !== undefined) terminalWordWrap.value = appSettings.terminalWordWrap
      if (appSettings?.terminalLineNumbers !== undefined) terminalLineNumbers.value = appSettings.terminalLineNumbers
      if (appSettings?.terminalLogEditable !== undefined) terminalLogEditable.value = appSettings.terminalLogEditable
    } catch {
      // Settings are optional during startup and unavailable in browser-only tests.
    }
  }

  const saveTerminalDisplaySettings = async () => {
    try {
      const currentSettings = await window.storageApi.getAppSettings()
      await window.storageApi.saveAppSettings({
        ...currentSettings,
        terminalWordWrap: terminalWordWrap.value,
        terminalLineNumbers: terminalLineNumbers.value,
        terminalLogEditable: terminalLogEditable.value
      })
    } catch {
      // Do not block terminal interaction if persistence temporarily fails.
    }
  }

  const applyToAllTerminals = (
    connectionTabs: any[],
    comTerminalRefs: Record<string, any>,
    telnetTerminalRefs: Record<string, any>,
    method: string,
    value: boolean
  ) => {
    for (const tab of connectionTabs) {
      const tabId = tab.id.toString()
      if (comTerminalRefs[tabId]) {
        comTerminalRefs[tabId]?.[method]?.(value)
      } else if (telnetTerminalRefs[tabId]) {
        telnetTerminalRefs[tabId]?.[method]?.(value)
      }
    }
  }

  const applyTerminalDisplaySettingsToTab = (
    tabId: string,
    comTerminalRefs: Record<string, any>,
    telnetTerminalRefs: Record<string, any>
  ) => {
    const terminalRef = comTerminalRefs[tabId] || telnetTerminalRefs[tabId]
    if (!terminalRef) return

    terminalRef.setWordWrap?.(terminalWordWrap.value)
    terminalRef.setLineNumbers?.(terminalLineNumbers.value)
    terminalRef.setLogEditable?.(terminalLogEditable.value)
  }

  return {
    terminalWordWrap,
    terminalLineNumbers,
    terminalLogEditable,
    loadTerminalDisplaySettings,
    saveTerminalDisplaySettings,
    applyToAllTerminals,
    applyTerminalDisplaySettingsToTab
  }
}
