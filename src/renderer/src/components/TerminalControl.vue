<template>
  <FeatureTerminalControl v-bind="$props" v-on="$attrs" />
</template>

<script setup lang="ts">
import FeatureTerminalControl from '../features/terminal/TerminalControl.vue'

defineProps<{ isConnected: boolean; isConnecting: boolean; isAutoScroll: boolean; isShowLog: boolean; isShowTimestamp: boolean; isShowLogFilter?: boolean; activeSyntaxGroupId?: number }>()
</script>
