<template>
  <div v-show="visible" class="setting-item" :data-setting-id="resolvedId || undefined">
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * 设置项包装组件 —— 替代原来的 `<div class="setting-item">`。
 *
 * 外层 class 与原来完全一致，因此 main.css 里既有的 .setting-item 选择器照旧生效；
 * 唯一新增的行为是：搜索态下按 id（或 follow 指向的 id）决定是否显示。
 */
import { computed } from 'vue'
import { useSettingsFilter } from '../../features/settings/settingsFilterContext'

const props = defineProps<{
  /** 索引中的设置项 id，同时写入 data-setting-id */
  id?: string
  /** 跟随另一个设置项显示（用于提示块等附属内容） */
  follow?: string
}>()

const filter = useSettingsFilter()

const resolvedId = computed(() => props.id ?? props.follow ?? '')

const visible = computed(() => {
  const id = resolvedId.value
  if (!filter) return true
  if (!id) {
    // 未登记 id 时保持可见，避免误隐藏；开发环境给出提示便于补齐索引
    if (import.meta.env?.DEV) {
      console.warn('[SettingItem] missing id or follow prop')
    }
    return true
  }
  return filter.isVisible(id)
})
</script>
