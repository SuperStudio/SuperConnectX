<template>
  <FeatureTelnetTerminal v-bind="$props" v-on="$attrs" />
</template>

<script setup lang="ts">
import FeatureTelnetTerminal from '../features/terminal/TelnetTerminal.vue'

defineProps<{
  connection: {
    id: string | number
    connectionType: string
    host?: string
    port?: number
    name?: string
    sessionId: string | number
    ftpMode?: string
    encoding?: string
  }
  onClose?: () => void
  autoConnect?: boolean
  showBottomPanel?: boolean
}>()
</script>
