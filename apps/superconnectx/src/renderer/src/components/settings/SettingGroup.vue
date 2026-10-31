<template>
  <div v-show="visible" class="group-section">
    <div class="group-title">{{ title }}</div>
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * 设置分组包装组件 —— 替代原来的 `<div class="group-section">` + `<div class="group-title">`。
 *
 * 组内任一设置项命中时，其 group id 会进入可见集合，因此整组（含标题）一起显示。
 */
import { computed } from 'vue'
import { useSettingsFilter } from '../../features/settings/settingsFilterContext'

const props = defineProps<{
  /** 分组 id，与 settingsIndex.SETTINGS_GROUPS 保持一致 */
  id: string
  /** 分组标题（渲染为 .group-title） */
  title?: string
}>()

const filter = useSettingsFilter()

const visible = computed(() => (filter && props.id ? filter.isVisible(props.id) : true))
</script>
