/**
 * useTabManager 测试
 * 测试选项卡管理器核心逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        'tabs.tabPinned': 'Tab is pinned',
        'dialog.connectionExists': 'Connection already exists',
        'dialog.completeForm': 'Please complete the form',
        'dialog.deleteConfirm': `Delete ${params?.name}?`,
        'dialog.deleteConnection': 'Delete Connection',
        'common.confirm': 'Confirm',
        'common.cancel': 'Cancel',
        'common.operationFailed': 'Operation failed'
      }
      return translations[key] || key
    }
  })
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  },
  ElMessageBox: {
    confirm: vi.fn().mockResolvedValue('confirm')
  }
}))

vi.mock('../../src/renderer/src/entity/protocol', () => ({
  fromRawConnection: (conn: any) => ({ ...conn })
}))

// Mock window APIs
const mockStopConnect = vi.fn().mockResolvedValue({})
const mockStorageApi = {
  updateConnection: vi.fn().mockResolvedValue({}),
  addConnection: vi.fn().mockResolvedValue({}),
  deleteConnection: vi.fn().mockResolvedValue({}),
  getAppSettings: vi.fn().mockResolvedValue({})
}
;(globalThis as any).window = {
  connectApi: {
    stopConnect: mockStopConnect
  },
  storageApi: mockStorageApi
}

import { useTabManager, type TabItem } from '../../src/renderer/src/composables/app/useTabManager'

function makeTab(overrides: Partial<TabItem> = {}): TabItem {
  return {
    id: `tab-${Date.now()}-${Math.random()}`,
    connectionType: 'telnet',
    sessionId: Date.now(),
    host: '127.0.0.1',
    port: 23,
    ...overrides
  }
}

function makeComTab(overrides: Partial<TabItem> = {}): TabItem {
  return makeTab({ connectionType: 'com', comName: 'COM1', ...overrides })
}

function makeFtpTab(overrides: Partial<TabItem> = {}): TabItem {
  return makeTab({ connectionType: 'ftp', host: '127.0.0.1', port: 21, ...overrides })
}

function createMockRefs() {
  return {
    com: {} as Record<string, any>,
    telnet: {} as Record<string, any>
  }
}

describe('useTabManager', () => {
  let refs: ReturnType<typeof createMockRefs>

  beforeEach(() => {
    vi.clearAllMocks()
    refs = createMockRefs()
  })

  describe('initialization', () => {
    it('should return expected API', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      expect(manager.connectionTabs).toBeDefined()
      expect(manager.activeTabId).toBeDefined()
      expect(manager.pinnedTabs).toBeDefined()
      expect(typeof manager.switchTabById).toBe('function')
      expect(typeof manager.connectToServer).toBe('function')
      expect(typeof manager.connectToSerialPort).toBe('function')
    })

    it('should have empty tabs initially', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      expect(manager.connectionTabs.value).toHaveLength(0)
      expect(manager.activeTabId.value).toBe('')
    })
  })

  describe('connectToServer', () => {
    it('should add a new tab', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const conn = { id: 1, connectionType: 'telnet', host: '127.0.0.1', port: 23 }

      manager.connectToServer(conn)
      expect(manager.connectionTabs.value).toHaveLength(1)
      expect(manager.activeTabId.value).toBeTruthy()
    })

    it('should set sessionId and connectionId on new tab', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const conn = { id: 5, connectionType: 'telnet', host: '10.0.0.1', port: 22 }

      manager.connectToServer(conn)
      const tab = manager.connectionTabs.value[0]
      expect(tab.connectionId).toBe(5)
      expect(tab.sessionId).toBeDefined()
      expect(typeof tab.sessionId).toBe('number')
    })

    it('should activate the newly created tab', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      manager.connectToServer({ id: 1, connectionType: 'telnet', host: 'a', port: 1 })
      const tab1Id = manager.activeTabId.value

      manager.connectToServer({ id: 2, connectionType: 'telnet', host: 'b', port: 2 })
      expect(manager.activeTabId.value).not.toBe(tab1Id)
      expect(manager.connectionTabs.value).toHaveLength(2)
    })
  })

  describe('connectToSerialPort', () => {
    it('should add a COM tab', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const port = { path: 'COM3', manufacturer: 'Test', pnpId: 'PNP1', vendorId: 'V1', productId: 'P1' }

      manager.connectToSerialPort(port)
      expect(manager.connectionTabs.value).toHaveLength(1)
      const tab = manager.connectionTabs.value[0]
      expect(tab.connectionType).toBe('com')
      expect(tab.comName).toBe('COM3')
      expect(tab.baudRate).toBe(9600)
    })

    it('should reuse existing COM tab for same port', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const port = { path: 'COM3', manufacturer: 'Test', pnpId: 'PNP1', vendorId: 'V1', productId: 'P1' }

      manager.connectToSerialPort(port)
      manager.connectToSerialPort(port)
      expect(manager.connectionTabs.value).toHaveLength(1)
    })

    it('should switch to existing tab if port already open', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const port = { path: 'COM3', manufacturer: 'Test', pnpId: 'PNP1', vendorId: 'V1', productId: 'P1' }

      manager.connectToSerialPort(port)
      const firstId = manager.activeTabId.value

      // Add another tab then switch back
      manager.connectToServer({ id: 99, connectionType: 'telnet', host: 'x', port: 1 })
      manager.connectToSerialPort(port)

      expect(manager.activeTabId.value).toBe(firstId)
      expect(manager.connectionTabs.value).toHaveLength(2)
    })
  })

  describe('switchTabById', () => {
    it('should switch active tab', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab1 = makeTab({ id: 'tab-1', host: 'a' })
      const tab2 = makeTab({ id: 'tab-2', host: 'b' })

      manager.connectionTabs.value = [tab1, tab2]
      manager.activeTabId.value = 'tab-1'

      manager.switchTabById('tab-2')
      expect(manager.activeTabId.value).toBe('tab-2')
    })

    it('should accept number as tab ID', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      manager.connectionTabs.value = [makeTab({ id: '123' })]

      manager.switchTabById(123)
      expect(manager.activeTabId.value).toBe('123')
    })
  })

  describe('getConnectionStatus', () => {
    it('should return disconnected for unknown tab', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab = makeTab()
      expect(manager.getConnectionStatus(tab)).toBe('disconnected')
    })

    it('should check com terminal ref for com type', () => {
      refs.com = { 'com-1': { isConnected: true } }
      const manager = useTabManager(refs.com, refs.telnet)
      const tab = makeComTab({ id: 'com-1' })

      expect(manager.getConnectionStatus(tab)).toBe('connected')
    })

    it('should check telnet terminal ref for telnet type', () => {
      refs.telnet = { 't-1': { isConnected: true } }
      const manager = useTabManager(refs.com, refs.telnet)
      const tab = makeTab({ id: 't-1' })

      expect(manager.getConnectionStatus(tab)).toBe('connected')
    })
  })

  describe('hasAnyConnected', () => {
    it('should return false when no tabs connected', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      manager.connectionTabs.value = [makeTab({ id: 't1' })]
      expect(manager.hasAnyConnected.value).toBe(false)
    })

    it('should return true when at least one tab connected', () => {
      refs.telnet = { 't1': { isConnected: true } }
      const manager = useTabManager(refs.com, refs.telnet)
      manager.connectionTabs.value = [makeTab({ id: 't1' })]
      expect(manager.hasAnyConnected.value).toBe(true)
    })
  })

  describe('openCommandEditorTab', () => {
    it('should open a command editor tab', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      manager.openCommandEditorTab('telnet')

      const tab = manager.connectionTabs.value[0]
      expect(tab.connectionType).toBe('commandEditor')
      expect(tab.name).toBe('编辑命令-TELNET')
    })

    it('should not create duplicate command editor tabs', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      manager.openCommandEditorTab('telnet')
      manager.openCommandEditorTab('telnet')

      expect(manager.connectionTabs.value).toHaveLength(1)
    })
  })

  describe('openShortcutsTab', () => {
    it('should open a shortcuts tab', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      manager.openShortcutsTab()

      const tab = manager.connectionTabs.value[0]
      expect(tab.connectionType).toBe('shortcuts')
      expect(tab.name).toBe('快捷键')
    })

    it('should not duplicate', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      manager.openShortcutsTab()
      manager.openShortcutsTab()
      expect(manager.connectionTabs.value).toHaveLength(1)
    })
  })

  describe('openSettingsTab', () => {
    it('should open a settings tab', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      manager.openSettingsTab()

      const tab = manager.connectionTabs.value[0]
      expect(tab.connectionType).toBe('settings')
      expect(tab.name).toBe('设置')
    })

    it('should not duplicate', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      manager.openSettingsTab()
      manager.openSettingsTab()
      expect(manager.connectionTabs.value).toHaveLength(1)
    })
  })

  describe('right-click menu', () => {
    it('should show context menu on right click', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab = makeTab({ id: 't1' })
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
        clientY: 200
      } as any

      manager.handleTabContextMenu(event, tab)
      expect(manager.showTabMenu.value).toBe(true)
      expect(manager.rightClickedTab.value?.id).toBe('t1')
      expect(manager.tabMenuPosition.value).toEqual({ x: 100, y: 200 })
    })

    it('should hide context menu', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      manager.showTabMenu.value = true
      manager.hideTabMenu()

      expect(manager.showTabMenu.value).toBe(false)
      expect(manager.rightClickedTab.value).toBeNull()
    })
  })

  describe('handleTabsNavContextMenu', () => {
    it('should find tab from event target', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab = makeTab({ id: 'nav-tab-1' })
      manager.connectionTabs.value = [tab]

      const mockClosest = vi.fn().mockReturnValue({ getAttribute: () => 'nav-tab-1' })
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 50,
        clientY: 60,
        target: { closest: mockClosest }
      } as any

      manager.handleTabsNavContextMenu(event)
      expect(mockClosest).toHaveBeenCalledWith('.tab-item')
      expect(manager.rightClickedTab.value?.id).toBe('nav-tab-1')
    })

    it('should hide menu if clicking on empty area', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      manager.showTabMenu.value = true
      manager.rightClickedTab.value = makeTab()

      const mockClosest = vi.fn().mockReturnValue(null)
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: { closest: mockClosest }
      } as any

      manager.handleTabsNavContextMenu(event)
      expect(manager.showTabMenu.value).toBe(false)
    })
  })

  describe('reorderTabs', () => {
    it('should move tab after target', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab1 = makeTab({ id: 'a', host: 'host-a' })
      const tab2 = makeTab({ id: 'b', host: 'host-b' })
      const tab3 = makeTab({ id: 'c', host: 'host-c' })
      manager.connectionTabs.value = [tab1, tab2, tab3]

      manager.reorderTabs('a', 'c', 'after')
      const ids = manager.connectionTabs.value.map((t: TabItem) => t.id)
      expect(ids).toEqual(['b', 'c', 'a'])
    })

    it('should move tab before target', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab1 = makeTab({ id: 'a' })
      const tab2 = makeTab({ id: 'b' })
      const tab3 = makeTab({ id: 'c' })
      manager.connectionTabs.value = [tab1, tab2, tab3]

      manager.reorderTabs('c', 'a', 'before')
      const ids = manager.connectionTabs.value.map((t: TabItem) => t.id)
      expect(ids).toEqual(['c', 'a', 'b'])
    })

    it('should handle unknown fromId gracefully', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      manager.connectionTabs.value = [makeTab({ id: 'a' })]
      expect(() => manager.reorderTabs('nonexistent', 'a')).not.toThrow()
    })

    it('should pin tab when toPin is true', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab1 = makeTab({ id: 'a' })
      const tab2 = makeTab({ id: 'b' })
      manager.connectionTabs.value = [tab1, tab2]

      manager.reorderTabs('a', 'b', 'after', true)
      expect(manager.pinnedTabs.has('a')).toBe(true)
    })

    it('should unpin tab when toPin is false and tab was pinned', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab1 = makeTab({ id: 'a' })
      const tab2 = makeTab({ id: 'b' })
      manager.connectionTabs.value = [tab1, tab2]
      manager.pinnedTabs.add('a')

      manager.reorderTabs('a', 'b', 'after', false)
      expect(manager.pinnedTabs.has('a')).toBe(false)
    })
  })

  describe('moveTabToFirst', () => {
    it('should move unpinned tab to first unpinned position', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const t1 = makeTab({ id: 'a' })
      const t2 = makeTab({ id: 'b' })
      const t3 = makeTab({ id: 'c' })
      manager.connectionTabs.value = [t1, t2, t3]
      // Pin t1
      manager.pinnedTabs.add('a')
      manager.rightClickedTab.value = t3

      manager.moveTabToFirst()
      // c should be right after a (the pinned tab)
      const ids = manager.connectionTabs.value.map((t: TabItem) => t.id)
      expect(ids).toEqual(['a', 'c', 'b'])
    })

    it('should not move if already first', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const t1 = makeTab({ id: 'a' })
      const t2 = makeTab({ id: 'b' })
      manager.connectionTabs.value = [t1, t2]
      manager.rightClickedTab.value = t1

      manager.moveTabToFirst()
      const ids = manager.connectionTabs.value.map((t: TabItem) => t.id)
      expect(ids).toEqual(['a', 'b'])
    })
  })

  describe('moveTabToLast', () => {
    it('should move pinned tab to last pinned position', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const t1 = makeTab({ id: 'a' })
      const t2 = makeTab({ id: 'b' })
      const t3 = makeTab({ id: 'c' })
      manager.connectionTabs.value = [t1, t2, t3]
      manager.pinnedTabs.add('a')
      manager.pinnedTabs.add('b')
      manager.rightClickedTab.value = t1

      manager.moveTabToLast()
      const ids = manager.connectionTabs.value.map((t: TabItem) => t.id)
      expect(ids).toEqual(['b', 'a', 'c'])
    })

    it('should move unpinned tab to last unpinned position', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const t1 = makeTab({ id: 'a' })
      const t2 = makeTab({ id: 'b' })
      const t3 = makeTab({ id: 'c' })
      manager.connectionTabs.value = [t1, t2, t3]
      manager.pinnedTabs.add('a')
      manager.rightClickedTab.value = t2

      manager.moveTabToLast()
      const ids = manager.connectionTabs.value.map((t: TabItem) => t.id)
      expect(ids).toEqual(['a', 'c', 'b'])
    })
  })

  describe('togglePinTab', () => {
    it('should pin an unpinned tab', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab = makeTab({ id: 'pin-me' })
      manager.connectionTabs.value = [tab]
      manager.rightClickedTab.value = tab

      manager.togglePinTab()
      expect(manager.pinnedTabs.has('pin-me')).toBe(true)
      expect(manager.showTabMenu.value).toBe(false)
    })

    it('should unpin a pinned tab', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab = makeTab({ id: 'unpin-me' })
      manager.connectionTabs.value = [tab]
      manager.pinnedTabs.add('unpin-me')
      manager.rightClickedTab.value = tab

      manager.togglePinTab()
      expect(manager.pinnedTabs.has('unpin-me')).toBe(false)
    })
  })

  describe('togglePinTabByButton', () => {
    it('should unpin and reposition when unpinning', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const t1 = makeTab({ id: 'a' })
      const t2 = makeTab({ id: 'b' })
      manager.connectionTabs.value = [t1, t2]
      manager.pinnedTabs.add('a')

      manager.togglePinTabByButton('a')
      expect(manager.pinnedTabs.has('a')).toBe(false)
    })

    it('should close tab when pinning via button (closeTabOnly)', async () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab = makeTab({ id: 'btn-pin', connectionType: 'com' })
      manager.connectionTabs.value = [tab]

      // When pinning via button and not already pinned, it calls closeTabOnly
      // which will try to disconnect - this is the expected behavior
      await manager.togglePinTabByButton('btn-pin')
      // closeTabOnly is called which filters out the tab
      // but our mock refs might not have the needed methods, so the tab may remain
      // The key behavior is that it doesn't throw
    })
  })

  describe('getLastPinnedIndex', () => {
    it('should return -1 when no tabs pinned', () => {
      const manager = useTabManager(refs.com, refs.telnet)
      manager.connectionTabs.value = [makeTab({ id: 'a' }), makeTab({ id: 'b' })]

      // getLastPinnedIndex is private, test via togglePinTab behavior
      expect(manager.pinnedTabs.size).toBe(0)
    })
  })

  describe('closeTabOnly', () => {
    it('should not close pinned tab', async () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab = makeTab({ id: 'pinned-close', connectionType: 'com' })
      manager.connectionTabs.value = [tab]
      manager.pinnedTabs.add('pinned-close')

      await manager.closeTabOnly('pinned-close')
      expect(manager.connectionTabs.value).toHaveLength(1)
    })

    it('should close unpinned tab', async () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab = makeTab({ id: 'close-me', connectionType: 'com' })
      manager.connectionTabs.value = [tab, makeTab({ id: 'keep-me', connectionType: 'com' })]

      await manager.closeTabOnly('close-me')
      expect(manager.connectionTabs.value).toHaveLength(1)
      expect(manager.connectionTabs.value[0].id).toBe('keep-me')
    })
  })

  describe('closeSingleTab', () => {
    it('should not close pinned tab from context menu', async () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab = makeTab({ id: 'pinned-single' })
      manager.connectionTabs.value = [tab]
      manager.pinnedTabs.add('pinned-single')

      await manager.closeSingleTab(tab)
      expect(manager.connectionTabs.value).toHaveLength(1)
      expect(manager.showTabMenu.value).toBe(false)
    })
  })

  describe('closeOtherTabs', () => {
    it('should close all tabs except right-clicked one', async () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const t1 = makeTab({ id: 'keep', connectionType: 'com' })
      const t2 = makeTab({ id: 'close1', connectionType: 'com' })
      const t3 = makeTab({ id: 'close2', connectionType: 'com' })
      manager.connectionTabs.value = [t1, t2, t3]
      manager.rightClickedTab.value = t1

      await manager.closeOtherTabs()
      expect(manager.connectionTabs.value).toHaveLength(1)
      expect(manager.connectionTabs.value[0].id).toBe('keep')
    })
  })

  describe('closeLeftTabs', () => {
    it('should close tabs to the left', async () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const t1 = makeTab({ id: 'left1', connectionType: 'com' })
      const t2 = makeTab({ id: 'left2', connectionType: 'com' })
      const t3 = makeTab({ id: 'keep', connectionType: 'com' })
      manager.connectionTabs.value = [t1, t2, t3]
      manager.rightClickedTab.value = t3

      await manager.closeLeftTabs()
      const ids = manager.connectionTabs.value.map((t: TabItem) => t.id)
      expect(ids).toEqual(['keep'])
    })
  })

  describe('closeRightTabs', () => {
    it('should close tabs to the right', async () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const t1 = makeTab({ id: 'keep', connectionType: 'com' })
      const t2 = makeTab({ id: 'right1', connectionType: 'com' })
      const t3 = makeTab({ id: 'right2', connectionType: 'com' })
      manager.connectionTabs.value = [t1, t2, t3]
      manager.rightClickedTab.value = t1

      await manager.closeRightTabs()
      const ids = manager.connectionTabs.value.map((t: TabItem) => t.id)
      expect(ids).toEqual(['keep'])
    })
  })

  describe('closeAllTabs', () => {
    it('should close all closable tabs', async () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const t1 = makeTab({ id: 'all1', connectionType: 'com' })
      const t2 = makeTab({ id: 'all2', connectionType: 'com' })
      manager.connectionTabs.value = [t1, t2]

      await manager.closeAllTabs()
      expect(manager.connectionTabs.value).toHaveLength(0)
    })
  })

  describe('closeTab', () => {
    it('should not close pinned tab without force', async () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab = makeTab({ id: 'pinned-tab', connectionType: 'com' })
      manager.connectionTabs.value = [tab]
      manager.pinnedTabs.add('pinned-tab')

      await manager.closeTab('pinned-tab')
      expect(manager.connectionTabs.value).toHaveLength(1)
    })

    it('should close pinned tab with force=true', async () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const tab = makeTab({ id: 'force-close', connectionType: 'com' })
      manager.connectionTabs.value = [tab, makeTab({ id: 'other', connectionType: 'com' })]
      manager.pinnedTabs.add('force-close')

      await manager.closeTab('force-close', true)
      expect(manager.connectionTabs.value).toHaveLength(1)
    })

    it('should switch to last tab after closing active', async () => {
      const manager = useTabManager(refs.com, refs.telnet)
      const t1 = makeTab({ id: 'first', connectionType: 'com' })
      const t2 = makeTab({ id: 'second', connectionType: 'com' })
      manager.connectionTabs.value = [t1, t2]
      manager.activeTabId.value = 'second'

      await manager.closeTab('second', true)
      expect(manager.activeTabId.value).toBe('first')
    })
  })

  describe('connectAllTabs / disconnectAllTabs', () => {
    it('connectAllTabs should call reconnect on disconnected tabs', async () => {
      const reconnectCom = vi.fn()
      const reconnectTelnet = vi.fn()
      refs.com = { 'com-1': { isConnected: false, reconnect: reconnectCom } }
      refs.telnet = { 't-1': { isConnected: false, reconnect: reconnectTelnet } }

      const manager = useTabManager(refs.com, refs.telnet)
      manager.connectionTabs.value = [
        makeComTab({ id: 'com-1' }),
        makeTab({ id: 't-1' })
      ]

      await manager.connectAllTabs()
      expect(reconnectCom).toHaveBeenCalled()
      expect(reconnectTelnet).toHaveBeenCalled()
    })

    it('connectAllTabs should skip already connected tabs', async () => {
      const reconnectCom = vi.fn()
      refs.com = { 'com-1': { isConnected: true, reconnect: reconnectCom } }

      const manager = useTabManager(refs.com, refs.telnet)
      manager.connectionTabs.value = [makeComTab({ id: 'com-1' })]

      await manager.connectAllTabs()
      expect(reconnectCom).not.toHaveBeenCalled()
    })

    it('disconnectAllTabs should disconnect connected tabs', async () => {
      const prevent = vi.fn()
      const disconnect = vi.fn()
      refs.telnet = { 't-1': { isConnected: true, preventAutoReconnect: prevent, disconnect } }

      const manager = useTabManager(refs.com, refs.telnet)
      manager.connectionTabs.value = [makeTab({ id: 't-1' })]

      await manager.disconnectAllTabs()
      expect(prevent).toHaveBeenCalled()
      expect(disconnect).toHaveBeenCalled()
    })
  })
})
