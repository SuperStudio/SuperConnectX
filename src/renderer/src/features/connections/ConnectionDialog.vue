<template>
  <LegacyConnectionDialog ref="dialogRef" v-bind="$attrs" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import LegacyConnectionDialog from '../../components/ConnectionDialog.vue'

interface ConnectionDialogInstance {
  open: (defaultType?: string) => void
  openEdit: (connection: unknown) => void
  closeOnSuccess: () => void
  onSaveError: (message: string) => void
}

const dialogRef = ref<ConnectionDialogInstance | null>(null)

defineExpose({
  open: (defaultType?: string) => dialogRef.value?.open(defaultType),
  openEdit: (connection: unknown) => dialogRef.value?.openEdit(connection),
  closeOnSuccess: () => dialogRef.value?.closeOnSuccess(),
  onSaveError: (message: string) => dialogRef.value?.onSaveError(message)
})
</script>
