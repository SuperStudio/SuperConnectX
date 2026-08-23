<template>
  <NotificationCenter ref="notificationCenterRef" :clear-all-label="t('terminal.clearAll')" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import NotificationCenter from '../foundation/shell/NotificationCenter.vue'

const { t } = useI18n()
const notificationCenterRef = ref<InstanceType<typeof NotificationCenter> | null>(null)

const add = (title: string, message: string): number | undefined => notificationCenterRef.value?.add(title, message)
const remove = (id: number): void => notificationCenterRef.value?.remove(id)
const clear = (): void => notificationCenterRef.value?.clear()

defineExpose({ add, remove, clear })
</script>
