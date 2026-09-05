<template>
  <FeaturePresetCommands v-bind="$props" v-on="$attrs" />
</template>

<script setup lang="ts">
import FeaturePresetCommands from '../features/commands/PresetCommands.vue'

defineProps<{
  isConnected: boolean
  hexMode?: boolean
  autoNewline?: boolean
  crcEnabled?: boolean
  crcMethod?: string
  connection: {
    id: string | number
    host?: string
    port?: number
    name?: string
    connectionType?: string
    comName?: string
    sessionId: string | number
  }
}>()
</script>
