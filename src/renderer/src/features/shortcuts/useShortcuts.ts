/**
 * SuperConnectX keyboard shortcut feature.
 * The action map deliberately composes product-specific connection, terminal,
 * command-editor and window behavior; it is not renderer foundation code.
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

export interface ShortcutActionMap {
  openCreateDialog: () => void
  closeSingleTab: (tab: any) => void
  toggleConnectionList: () => void
  loadSerialPorts: () => Promise<void>
  openCommandEditorTab: (connectionType?: string) => void
  openSettingsTab: () => void
  togglePinTab: () => void
  moveTabToFirst: () => void
  moveTabToLast: () => void
  openSettingsAndSwitchToSyntax: () => void
  toggleWordWrap: () => void
}

export function useShortcuts(
  actionMap: ShortcutActionMap,
  connectionTabs: any,
  activeTabId: any,
  hasAnyConnected: any,
  comTerminalRefs: any,
  telnetTerminalRefs: any,
  rightClickedTab: any,
  disconnectAllTabs: () => void,
  connectAllTabs: () => void,
  switchTabById: (id: string | number) => void,
  togglePinTab: () => void,
  moveTabToFirst: () => void,
  moveTabToLast: () => void
) {
  const { t } = useI18n()
  const shortcuts = ref<Array<{ action: string; keys: string[] }>>([])
  const shortcutActions = ref<Record<string, () => void>>({})

  const normalizeShortcutKey = (key: string): string => {
    const upperKey = key.toUpperCase()
    if (['CONTROL', 'CMD', 'COMMAND', 'COMMANDORCONTROL', 'SUPER', 'HYPER'].includes(upperKey)) return 'Ctrl'
    return key
  }

  const normalizeEventKey = (event: KeyboardEvent): string[] => {
    const keys: string[] = []
    if (event.ctrlKey) keys.push('Ctrl')
    if (event.altKey) keys.push('Alt')
    if (event.shiftKey) keys.push('Shift')
    if (event.metaKey) keys.push('Meta')
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
      keys.push(event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key)
    }
    return keys
  }

  const handleShortcutKeydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
    if (document.querySelector('.el-dialog__wrapper')) return

    const pressedKeys = normalizeEventKey(event)
    for (const shortcut of shortcuts.value) {
      if (!shortcut.keys || shortcut.keys.length === 0) continue
      const shortcutKeys = shortcut.keys.map(normalizeShortcutKey)
      if (pressedKeys.length === shortcutKeys.length && pressedKeys.every((key) => shortcutKeys.includes(key))) {
        const action = shortcutActions.value[shortcut.action]
        if (action) {
          event.preventDefault()
          action()
          return
        }
      }
    }
  }

  const loadShortcutActions = async () => {
    try {
      const actions = await window.storageApi.getShortcutActions()
      if (actions && typeof actions === 'object') {
        shortcutActions.value = {
          'Tab:newConnection': () => actionMap.openCreateDialog(),
          'Tab:close': () => {
            if (!activeTabId.value) return
            actionMap.closeSingleTab(connectionTabs.value.find((tab: any) => tab.id.toString() === activeTabId.value) || { id: activeTabId.value })
          },
          'Tab:toggleConnection': () => {
            if (!activeTabId.value) return
            const tab = connectionTabs.value.find((item: any) => item.id.toString() === activeTabId.value)
            if (!tab) return
            const terminal = tab.connectionType === 'com' ? comTerminalRefs[tab.id] : telnetTerminalRefs[tab.id]
            if (terminal?.isConnected) {
              terminal.preventAutoReconnect?.()
              terminal.disconnect?.()
            } else {
              terminal?.reconnect?.()
            }
          },
          'Tab:toggleAllConnections': () => {
            if (hasAnyConnected.value) disconnectAllTabs()
            else connectAllTabs()
          },
          'Terminal:clear': () => {
            if (!activeTabId.value) return
            const terminal = comTerminalRefs[activeTabId.value] || telnetTerminalRefs[activeTabId.value]
            terminal?.clearTerminal?.()
          },
          'Tab:pinCurrent': () => {
            if (!activeTabId.value) return
            const tab = connectionTabs.value.find((item: any) => item.id.toString() === activeTabId.value)
            if (tab) {
              rightClickedTab.value = tab
              togglePinTab()
            }
          },
          'Tab:prev': () => {
            if (connectionTabs.value.length === 0) return
            const currentIndex = connectionTabs.value.findIndex((tab: any) => tab.id.toString() === activeTabId.value)
            const previousIndex = currentIndex <= 0 ? connectionTabs.value.length - 1 : currentIndex - 1
            switchTabById(connectionTabs.value[previousIndex].id)
          },
          'Tab:next': () => {
            if (connectionTabs.value.length === 0) return
            const currentIndex = connectionTabs.value.findIndex((tab: any) => tab.id.toString() === activeTabId.value)
            const nextIndex = currentIndex >= connectionTabs.value.length - 1 ? 0 : currentIndex + 1
            switchTabById(connectionTabs.value[nextIndex].id)
          },
          'Tab:moveFirst': () => {
            if (!activeTabId.value) return
            const tab = connectionTabs.value.find((item: any) => item.id.toString() === activeTabId.value)
            if (tab) {
              rightClickedTab.value = tab
              moveTabToFirst()
            }
          },
          'Tab:moveLast': () => {
            if (!activeTabId.value) return
            const tab = connectionTabs.value.find((item: any) => item.id.toString() === activeTabId.value)
            if (tab) {
              rightClickedTab.value = tab
              moveTabToLast()
            }
          },
          'CommandEditor:open': () => {
            if (!activeTabId.value) return
            const activeTab = connectionTabs.value.find((tab: any) => tab.id.toString() === activeTabId.value)
            if (!activeTab || !['com', 'telnet', 'ftp'].includes(activeTab.connectionType)) return
            actionMap.openCommandEditorTab(activeTab.connectionType === 'com' ? 'telnet' : activeTab.connectionType)
          },
          'ConnectionList:toggle': () => actionMap.toggleConnectionList(),
          'SerialPort:refresh': () => actionMap.loadSerialPorts(),
          'Window:toggleFullscreen': () => window.windowApi.toggleFullscreenWindow(),
          'Terminal:toggleWordWrap': () => actionMap.toggleWordWrap()
        }
      }
    } catch (error) {
      console.error(t('shortcuts.loadFailed'), error)
    }
  }

  const loadShortcuts = async () => {
    try {
      const data = await window.storageApi.getShortcuts()
      if (Array.isArray(data) && data.length > 0) shortcuts.value = data
    } catch (error) {
      console.error(t('shortcuts.loadFailed'), error)
    }
  }

  const handleShortcutsUpdated = async () => loadShortcuts()

  return { shortcuts, shortcutActions, handleShortcutKeydown, loadShortcutActions, loadShortcuts, handleShortcutsUpdated }
}
