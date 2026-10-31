/**
 * 设置页搜索/过滤上下文
 *
 * SettingsPage 在 setup 阶段 provide，SettingGroup / SettingItem 通过 inject 消费。
 * 两者只读写「是否可见」，不关心具体搜索逻辑，便于各自独立演进与测试。
 */
import {
  computed,
  inject,
  provide,
  ref,
  type ComputedRef,
  type InjectionKey,
  type Ref
} from 'vue'
import { searchSettings, type SearchHit, type TranslateFn } from './settingsIndex'

export interface SettingsFilterContext {
  /** 当前搜索词 */
  query: Ref<string>
  /** 是否处于搜索态（关键词非空） */
  isFiltering: ComputedRef<boolean>
  /** 命中的设置项，已排序 */
  hits: ComputedRef<SearchHit[]>
  /** 应显示的 id 集合（命中项 + 其所属分组） */
  visibleIds: ComputedRef<Set<string>>
  /** 命中总数（跨全部分类） */
  resultCount: ComputedRef<number>
  /** 指定 id 在搜索态下是否可见；未搜索时恒为 true */
  isVisible: (id: string) => boolean
  /** 指定分类的命中数量 */
  countByCategory: (category: string) => number
  setQuery: (value: string) => void
  clear: () => void
}

const SETTINGS_FILTER: InjectionKey<SettingsFilterContext> = Symbol('settings-filter')

export function provideSettingsFilter(t: TranslateFn): SettingsFilterContext {
  const query = ref('')
  const result = computed(() => searchSettings(query.value, t))

  const hits = computed(() => result.value.hits)
  const visibleIds = computed(() => result.value.visibleIds)
  const isFiltering = computed(() => query.value.trim().length > 0)
  const resultCount = computed(() => hits.value.length)

  const isVisible = (id: string): boolean => {
    if (!isFiltering.value || !id) return true
    return visibleIds.value.has(id)
  }

  const countByCategory = (category: string): number =>
    hits.value.reduce((sum, hit) => (hit.entry.category === category ? sum + 1 : sum), 0)

  const setQuery = (value: string) => {
    query.value = value ?? ''
  }
  const clear = () => {
    query.value = ''
  }

  const ctx: SettingsFilterContext = {
    query,
    isFiltering,
    hits,
    visibleIds,
    resultCount,
    isVisible,
    countByCategory,
    setQuery,
    clear
  }
  provide(SETTINGS_FILTER, ctx)
  return ctx
}

/** 子组件消费；没有 provide 时返回 null，此时一律视为可见（组件可独立使用） */
export function useSettingsFilter(): SettingsFilterContext | null {
  return inject(SETTINGS_FILTER, null)
}
