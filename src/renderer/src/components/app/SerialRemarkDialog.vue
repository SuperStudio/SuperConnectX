<template>
  <ConnectionSerialRemarkDialog ref="dialogRef" v-bind="$props" v-on="$attrs" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ConnectionSerialRemarkDialog from '../../features/connections/SerialRemarkDialog.vue'

defineProps<{
  visible: boolean
  comName: string
  remark: string
}>()

const dialogRef = ref<InstanceType<typeof ConnectionSerialRemarkDialog> | null>(null)
defineExpose({
  get remarkInputRef() {
    return dialogRef.value?.remarkInputRef
  }
})
</script>
