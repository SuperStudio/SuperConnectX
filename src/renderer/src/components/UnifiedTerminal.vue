<template>
  <FeatureUnifiedTerminal v-bind="$props" v-on="$attrs" />
</template>

<script setup lang="ts">
import FeatureUnifiedTerminal from '../features/terminal/UnifiedTerminal.vue'

withDefaults(defineProps<{
  connection: {
    id: string | number
    connectionType: string
    comName?: string
    host?: string
    port?: number
    name?: string
    sessionId: string | number
    [key: string]: any
  }
  isConnected?: boolean
  isConnecting?: boolean
  initMessage?: string
  placeholder?: string
  sessionIdPrefix?: string
  showBottomPanel?: boolean
}>(), {
  isConnected: false,
  isConnecting: false,
  initMessage: '',
  placeholder: '',
  sessionIdPrefix: 'terminal',
  showBottomPanel: true
})
</script>
