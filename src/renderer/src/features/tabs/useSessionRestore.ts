/**
 * useSessionRestore - 会话恢复
 * 保存/恢复用户上次退出时打开的选项卡、固定状态、活动选项卡及分屏布局。
 * 仅在用户主动打开过连接/选项卡时才保存，避免记录"全新启动"的空状态。
 */
import { nextTick, ref, watch, type Ref } from 'vue'
import type { TabItem } from './useTabManager'
import type { SplitState, Panel } from '@superx/foundation/workbench/useSplitWorkspace'

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
  // 透传任意历史会话字段（字段不可预知），故保留宽松索引签名
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/** Public surface returned by {@link useSessionRestore}. */
export interface SessionRestoreController {
  hasLoaded: Ref<boolean>
  savedTabs: Ref<TabItem[]>
  savedPinnedTabIds: Ref<string[]>
  savedActiveTabId: Ref<string>
  savedSplitPanels: Ref<SessionPanel[]>
  savedSplitDirection: Ref<'horizontal' | 'vertical'>
  savedSplitRatio: Ref<number>
  scheduleSave: () => void
  restore: () => Promise<void>
  applyToWorkspace: () => Promise<void>
  clearSession: () => Promise<void>
}

export function useSessionRestore(options: {
  connectionTabs: { value: TabItem[] }
  activeTabId: { value: string }
  pinnedTabs: { has: (id: string) => boolean; add: (id: string) => void }
  splitState: SplitState
  isConnected: (tab: TabItem) => boolean
  connectionStateDependency?: { value: number }
}): SessionRestoreController {
  const {
    connectionTabs,
    activeTabId,
    pinnedTabs,
    splitState,
    isConnected,
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
    return {
      tabs: connectionTabs.value.map((tab) => ({
        ...tab,
        password: undefined,
        wasConnected: isConnected(tab)
      })),
      activeTabId: activeTabId.value,
      pinnedTabIds: connectionTabs.value.filter((t) => pinnedTabs.has(t.id)).map((t) => t.id),
      panels: splitState.panels.map((p) => ({
        id: p.id,
        activeTabId: p.activeTabId,
        tabIds: [...p.tabIds]
      })),
      direction: splitState.direction,
      splitRatio: splitState.splitRatio
    }
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleSave = (): void => {
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
  const restore = async (): Promise<void> => {
    const session = await loadSession()
    if (!session) {
      hasLoaded.value = true
      return
    }
    savedTabs.value = session.tabs
    savedActiveTabId.value = session.activeTabId || ''
    savedPinnedTabIds.value = session.pinnedTabIds || []
    savedSplitPanels.value = session.panels || []
    savedSplitDirection.value = session.direction || 'horizontal'
    savedSplitRatio.value = session.splitRatio ?? 0.5
    hasLoaded.value = true
  }

  /**
   * 把已恢复的会话应用到工作区状态（重建选项卡 / 固定状态 / 活动选项卡与分屏布局）。
   * 由应用层在 {@link restore} 之后调用。
   */
  const applyToWorkspace = async (): Promise<void> => {
    if (!savedTabs.value || savedTabs.value.length === 0) return

    // 重建选项卡（保持原有顺序）
    const restored = savedTabs.value.map((tab) => ({
      ...JSON.parse(JSON.stringify(tab)),
      wasConnected: !!tab.wasConnected
    }))
    connectionTabs.value = restored

    // 恢复固定状态
    for (const id of savedPinnedTabIds.value) {
      pinnedTabs.add(id)
    }

    // 恢复活动选项卡
    if (savedActiveTabId.value) {
      activeTabId.value = savedActiveTabId.value
    }

    // 恢复分屏布局（先清空默认面板，再按保存的面板重建）
    if (savedSplitPanels.value && savedSplitPanels.value.length > 0) {
      const mappedPanels: Panel[] = savedSplitPanels.value.map((p, index) => ({
        id: index === 0 ? 'panel-0' : p.id,
        activeTabId: p.activeTabId,
        tabIds: [...p.tabIds]
      }))
      splitState.panels.splice(0, splitState.panels.length, ...mappedPanels)
      splitState.direction = savedSplitDirection.value || 'horizontal'
      splitState.splitRatio = savedSplitRatio.value ?? 0.5
    }

    await nextTick()
  }

  /**
   * 清空已保存的会话（用于关闭全部选项卡后的状态清理）
   */
  const clearSession = async (): Promise<void> => {
    if (saveTimer) clearTimeout(saveTimer)
    try {
      const current = await window.storageApi.getAppSettings()
      const { session: _session, ...rest } = current || {}
      void _session
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
    applyToWorkspace,
    clearSession
  }
}

export type { SplitState, Panel }
