<template>
  <FeatureCommandEditor :connection-type="connectionType" />
</template>

<script setup lang="ts">
import FeatureCommandEditor from '../features/commands/CommandEditor.vue'

withDefaults(defineProps<{
  connectionType?: string
}>(), {
  connectionType: 'telnet'
})
</script>
