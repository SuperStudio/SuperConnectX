<template>
  <FeatureConnectionDialog ref="dialogRef" @submit="emit('submit', $event)" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import FeatureConnectionDialog from '../features/connections/ConnectionDialog.vue'
import type { ConnectionFormData } from '../entity/protocol/base'

const emit = defineEmits<{ (e: 'submit', data: ConnectionFormData): void }>()
const dialogRef = ref<InstanceType<typeof FeatureConnectionDialog> | null>(null)

defineExpose({
  open: (defaultType?: string) => dialogRef.value?.open(defaultType),
  openEdit: (connection: unknown) => dialogRef.value?.openEdit(connection),
  closeOnSuccess: () => dialogRef.value?.closeOnSuccess(),
  onSaveError: (message: string) => dialogRef.value?.onSaveError(message)
})
</script>
