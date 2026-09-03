<template>
  <SplitWorkspace
    ref="workspaceRef"
    :is-split="isSplit"
    :split-ratio="splitRatio"
    :drop-hint="t('tabs.dragToSplit')"
    @update-split-ratio="$emit('updateSplitRatio', $event)"
    @tab-drop-to-pane="(tabId, sourcePanelId, targetZone) => $emit('tabDropToPane', tabId, sourcePanelId, targetZone)"
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
defineProps<{ isSplit: boolean; splitRatio: number }>()
defineEmits<{
  updateSplitRatio: [ratio: number]
  tabDropToPane: [tabId: string, sourcePanelId: string, targetZone: string]
}>()

const workspaceRef = ref<InstanceType<typeof SplitWorkspace> | null>(null)
defineExpose({
  getLeftContainer: () => workspaceRef.value?.getLeftContainer(),
  getRightContainer: () => workspaceRef.value?.getRightContainer()
})
</script>
