/**
 * useSessionRestore - 会话恢复
 * 保存/恢复用户上次退出时打开的选项卡、固定状态、活动选项卡及分屏布局。
 * 仅在用户主动打开过连接/选项卡时才保存，避免记录"全新启动"的空状态。
 */
import { ref, watch } from 'vue'
import type { TabItem } from './useTabManager'
import type { SplitState, Panel } from './useSplitPanel'

const SAVE_DEBOUNCE_MS = 500
const ENABLED_STORAGE_KEY = 'session-restore-enabled'

export interface SessionTab {
  id: string
  connectionType: string
  sessionId: string | number
  name?: string
  host?: string
  comName?: string
  port?: number
  connectionId?: number
  editorConnectionType?: string
  wasConnected?: boolean
  [key: string]: any
}

export interface SessionPanel {
  id: string
  activeTabId: string
  tabIds: string[]
}

export interface SessionState {
  tabs: SessionTab[]
  activeTabId: string
  pinnedTabIds: string[]
  panels: SessionPanel[]
  direction?: 'horizontal' | 'vertical'
  splitRatio?: number
}

/**
 * 读取会话恢复开关（localStorage，默认开启）
 */
export function isSessionRestoreEnabled(): boolean {
  return localStorage.getItem(ENABLED_STORAGE_KEY) !== 'false'
}

/**
 * 切换会话恢复开关
 */
export function setSessionRestoreEnabled(enabled: boolean): void {
  localStorage.setItem(ENABLED_STORAGE_KEY, enabled ? 'true' : 'false')
}

export function useSessionRestore(options: {
  connectionTabs: { value: TabItem[] }
  activeTabId: { value: string }
  pinnedTabs: { has: (id: string) => boolean; add: (id: string) => void }
  splitState: SplitState
  isConnected: (tab: TabItem) => boolean
  shouldPersistTab?: (tab: TabItem) => boolean
  connectionStateDependency?: { value: number }
}) {
  const {
    connectionTabs,
    activeTabId,
    pinnedTabs,
    splitState,
    isConnected,
    shouldPersistTab = () => true,
    connectionStateDependency
  } = options

  const hasLoaded = ref(false)
  const savedTabs = ref<TabItem[]>([])
  const savedPinnedTabIds = ref<string[]>([])
  const savedActiveTabId = ref('')
  const savedSplitPanels = ref<SessionPanel[]>([])
  const savedSplitDirection = ref<'horizontal' | 'vertical'>('horizontal')
  const savedSplitRatio = ref(0.5)

  /**
   * 生成当前会话快照（不包含密码等敏感字段）
   */
  const buildSessionSnapshot = (): SessionState => {
    const persistedTabs = connectionTabs.value.filter(shouldPersistTab)
    const persistedIds = new Set(persistedTabs.map((tab) => tab.id.toString()))
    return {
      tabs: persistedTabs.map((tab) => {
        const { password, ...rest } = tab as any
        return {
          ...rest,
          password: undefined,
          wasConnected: isConnected(tab)
        }
      }),
      activeTabId: persistedIds.has(activeTabId.value)
        ? activeTabId.value
        : persistedTabs[0]?.id.toString() || '',
      pinnedTabIds: persistedTabs
        .filter((t) => pinnedTabs.has(t.id))
        .map((t) => t.id),
      panels: splitState.panels.map((p) => ({
        id: p.id,
        activeTabId: persistedIds.has(p.activeTabId)
          ? p.activeTabId
          : p.tabIds.find((id) => persistedIds.has(id)) || '',
        tabIds: p.tabIds.filter((id) => persistedIds.has(id))
      })),
      direction: splitState.direction,
      splitRatio: splitState.splitRatio
    }
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleSave = () => {
    if (!isSessionRestoreEnabled() || !hasLoaded.value) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      // 只有用户主动打开过选项卡才保存
      if (connectionTabs.value.length === 0) return
      const snapshot = JSON.parse(JSON.stringify(buildSessionSnapshot()))
      const current = await window.storageApi.getAppSettings()
      await window.storageApi.saveAppSettings({ ...current, session: snapshot })
    }, SAVE_DEBOUNCE_MS)
  }

  // 监听选项卡、固定状态、活动选项卡、分屏布局、连接状态变化 -> 自动保存
  watch(
    () => [
      connectionTabs.value,
      activeTabId.value,
      splitState.panels,
      connectionStateDependency?.value
    ],
    () => scheduleSave(),
    { deep: true }
  )

  /**
   * 从存储中加载会话快照到内部 ref（不直接改动 connectionTabs，由调用方重建）
   */
  const loadSession = async (): Promise<SessionState | null> => {
    if (!isSessionRestoreEnabled()) return null
    try {
      const settings = await window.storageApi.getAppSettings()
      if (settings?.session && Array.isArray(settings.session.tabs)) {
        return settings.session
      }
    } catch (e) {
      console.error('[useSessionRestore] loadSession failed:', e)
    }
    return null
  }

  /**
   * 恢复会话：设置内部状态，供调用方重建选项卡
   */
  const restore = async () => {
    const session = await loadSession()
    if (!session) {
      hasLoaded.value = true
      return
    }
    const restorableTabs = session.tabs.filter(shouldPersistTab)
    const restorableIds = new Set(restorableTabs.map((tab) => tab.id.toString()))
    savedTabs.value = restorableTabs
    savedActiveTabId.value = restorableIds.has(session.activeTabId)
      ? session.activeTabId
      : restorableTabs[0]?.id.toString() || ''
    savedPinnedTabIds.value = (session.pinnedTabIds || []).filter((id) =>
      restorableIds.has(id)
    )
    savedSplitPanels.value = (session.panels || []).map((panel) => ({
      ...panel,
      activeTabId: restorableIds.has(panel.activeTabId)
        ? panel.activeTabId
        : panel.tabIds.find((id) => restorableIds.has(id)) || '',
      tabIds: panel.tabIds.filter((id) => restorableIds.has(id))
    }))
    savedSplitDirection.value = session.direction || 'horizontal'
    savedSplitRatio.value = session.splitRatio ?? 0.5
    hasLoaded.value = true
  }

  /**
   * 清空已保存的会话（用于关闭全部选项卡后的状态清理）
   */
  const clearSession = async () => {
    if (saveTimer) clearTimeout(saveTimer)
    try {
      const current = await window.storageApi.getAppSettings()
      const { session, ...rest } = current || {}
      await window.storageApi.saveAppSettings({ ...rest, session: undefined })
    } catch (e) {
      console.error('[useSessionRestore] clearSession failed:', e)
    }
  }

  return {
    hasLoaded,
    savedTabs,
    savedPinnedTabIds,
    savedActiveTabId,
    savedSplitPanels,
    savedSplitDirection,
    savedSplitRatio,
    scheduleSave,
    restore,
    clearSession
  }
}

export type { SplitState, Panel }
