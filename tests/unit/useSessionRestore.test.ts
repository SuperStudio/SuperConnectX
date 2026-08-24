import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref, type Ref } from 'vue'
import { useSessionRestore } from '../../src/renderer/src/composables/app/useSessionRestore'
import type { TabItem } from '../../src/renderer/src/composables/app/useTabManager'

const storageApi = {
  getAppSettings: vi.fn(),
  saveAppSettings: vi.fn()
}

beforeEach(() => {
  vi.useFakeTimers()
  storageApi.getAppSettings.mockReset()
  storageApi.saveAppSettings.mockReset()
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn()
  })
  vi.stubGlobal('window', { storageApi })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function createRestore(tabs: TabItem[] = []): {
  restore: ReturnType<typeof useSessionRestore>
  connectionTabs: Ref<TabItem[]>
} {
  const connectionTabs = ref(tabs)
  const activeTabId = ref(tabs.at(-1)?.id || '')
  const pinnedTabs = reactive(new Set(tabs.map((tab) => tab.id)))
  const splitState = reactive({
    panels: [{ id: 'panel-0', activeTabId: activeTabId.value, tabIds: tabs.map((tab) => tab.id) }],
    direction: 'horizontal' as const,
    splitRatio: 0.5
  })
  const restore = useSessionRestore({
    connectionTabs,
    activeTabId,
    pinnedTabs,
    splitState,
    isConnected: () => true,
    shouldPersistTab: (tab) => !tab.aiManaged
  })
  return { restore, connectionTabs }
}

describe('useSessionRestore AI runtime tab boundary', () => {
  it('filters legacy AI-managed tabs while restoring saved state', async () => {
    storageApi.getAppSettings.mockResolvedValue({
      session: {
        tabs: [
          { id: 'user-com', sessionId: 'user-com', connectionType: 'com' },
          { id: 'ai-com', sessionId: 'ai-com', connectionType: 'com', aiManaged: true }
        ],
        activeTabId: 'ai-com',
        pinnedTabIds: ['user-com', 'ai-com'],
        panels: [{ id: 'panel-0', activeTabId: 'ai-com', tabIds: ['user-com', 'ai-com'] }]
      }
    })
    const { restore } = createRestore()

    await restore.restore()

    expect(restore.savedTabs.value.map((tab) => tab.id)).toEqual(['user-com'])
    expect(restore.savedActiveTabId.value).toBe('user-com')
    expect(restore.savedPinnedTabIds.value).toEqual(['user-com'])
    expect(restore.savedSplitPanels.value[0]).toMatchObject({
      activeTabId: 'user-com',
      tabIds: ['user-com']
    })
  })

  it('does not persist AI-managed runtime tabs in a new snapshot', async () => {
    storageApi.getAppSettings.mockResolvedValue({})
    const { restore } = createRestore([
      { id: 'user-com', sessionId: 'user-com', connectionType: 'com' },
      { id: 'ai-com', sessionId: 'ai-com', connectionType: 'com', aiManaged: true }
    ])
    await restore.restore()

    restore.scheduleSave()
    await vi.advanceTimersByTimeAsync(500)

    expect(storageApi.saveAppSettings).toHaveBeenCalledOnce()
    expect(storageApi.saveAppSettings.mock.calls[0][0].session).toMatchObject({
      tabs: [expect.objectContaining({ id: 'user-com' })],
      activeTabId: 'user-com',
      pinnedTabIds: ['user-com'],
      panels: [expect.objectContaining({ activeTabId: 'user-com', tabIds: ['user-com'] })]
    })
  })
})
