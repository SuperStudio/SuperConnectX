<template>
  <SplitWorkspace
    ref="workspaceRef"
    :is-split="isSplit"
    :split-ratio="splitRatio"
    :drop-hint="t('tabs.dragToSplit')"
    @update-split-ratio="$emit('updateSplitRatio', $event)"
    @tab-drop-to-pane="handleTabDropToPane"
  >
    <template #left><slot name="left" /></template>
    <template #right><slot name="right" /></template>
  </SplitWorkspace>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SplitWorkspace from '../../foundation/workbench/SplitWorkspace.vue'

const { t } = useI18n()
const props = defineProps<{ isSplit: boolean; splitRatio: number }>()
const emit = defineEmits<{
  updateSplitRatio: [ratio: number]
  tabDropToPane: [tabId: string, sourcePanelId: string, targetZone: string]
}>()

const handleTabDropToPane = (
  tabId: string,
  sourcePanelId: string,
  targetZone: 'left' | 'right'
) => {
  // 通用工作区只暴露左右区域；旧业务层使用 split-right 区分首次分屏。
  const legacyTargetZone = !props.isSplit && targetZone === 'right' ? 'split-right' : targetZone
  emit('tabDropToPane', tabId, sourcePanelId, legacyTargetZone)
}

const workspaceRef = ref<InstanceType<typeof SplitWorkspace> | null>(null)
defineExpose({
  getLeftContainer: () => workspaceRef.value?.getLeftContainer(),
  getRightContainer: () => workspaceRef.value?.getRightContainer()
})
</script>
