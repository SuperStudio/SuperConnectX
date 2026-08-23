<template>
  <div
    class="sidebar-resize-handle"
    :class="{ resizing }"
    @mousedown="$emit('resizeStart', $event)"
  />
</template>

<script setup lang="ts">
defineProps<{ resizing: boolean }>()
defineEmits<{ resizeStart: [event: MouseEvent] }>()
</script>

<style scoped>
.sidebar-resize-handle {
  width: 4px;
  height: 100%;
  background: transparent;
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  transition: background-color 0.2s;
}

.sidebar-resize-handle:hover,
.sidebar-resize-handle.resizing {
  background-color: var(--sidebar-resizer-hover);
}
</style>
