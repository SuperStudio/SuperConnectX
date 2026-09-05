<template>
  <FeatureLogFilterPanel v-bind="$props" v-on="$attrs" />
</template>

<script setup lang="ts">
import FeatureLogFilterPanel from '../features/diagnostics/LogFilterPanel.vue'

defineProps<{ visible: boolean; lines: Array<{ lineNumber: number; text: string }> }>()
</script>
