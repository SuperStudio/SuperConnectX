<template>
  <div
    class="sidebar-resize-handle"
    :class="{ resizing: isResizing }"
    aria-label="Resize sidebar"
    @mousedown="$emit('mousedown', $event)"
  />
</template>

<script setup lang="ts">
defineProps<{ isResizing: boolean }>()
defineEmits<{ mousedown: [event: MouseEvent] }>()
</script>

<style scoped>
.sidebar-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  z-index: 100;
  transition: background-color 0.2s;
}
.sidebar-resize-handle:hover,
.sidebar-resize-handle.resizing {
  background-color: var(--sidebar-resize-handle-hover);
}
</style>
