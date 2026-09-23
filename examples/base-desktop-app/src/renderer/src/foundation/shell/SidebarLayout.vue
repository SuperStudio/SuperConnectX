<template>
  <aside class="sidebar-layout" :style="style">
    <div class="sidebar-content"><slot /></div>
    <SidebarResizeHandle :is-resizing="isResizing" @mousedown="startResize" />
  </aside>
</template>

<script setup lang="ts">
import SidebarResizeHandle from './SidebarResizeHandle.vue'
import { useSidebarResize } from './useSidebarResize'

withDefaults(defineProps<{
  initialWidth?: number
  minWidth?: number
  maxWidth?: number
  storageKey?: string
}>(), {
  initialWidth: 220,
  minWidth: 160,
  maxWidth: 480,
  storageKey: 'app-sidebar-width'
})

const { width, isResizing, startResize, style } = useSidebarResize({
  initialWidth: 220,
  minWidth: 160,
  maxWidth: 480,
  storageKey: 'app-sidebar-width'
})
defineExpose({ width })
</script>

<style scoped>
.sidebar-layout {
  position: relative;
  background-color: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100%;
  overflow: hidden;
}

.sidebar-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
</style>
