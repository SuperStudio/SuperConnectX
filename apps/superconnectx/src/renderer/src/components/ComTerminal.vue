<template>
  <FeatureComTerminal v-bind="$props" v-on="$attrs" />
</template>

<script setup lang="ts">
import FeatureComTerminal from '../features/terminal/ComTerminal.vue'

defineProps<{
  connection: {
    id: string | number
    connectionType: string
    comName?: string
    baudRate?: number
    dataBits?: number
    stopBits?: number
    parity?: string
    name?: string
    host?: string
    port?: number
    username?: string
    password?: string
    sessionId: string | number
    remark?: string
  }
  autoConnect?: boolean
  showBottomPanel?: boolean
  onClose?: () => void
}>()
</script>
