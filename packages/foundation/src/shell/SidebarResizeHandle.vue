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
  width: 0;
  height: 100%;
  cursor: col-resize;
  flex: 0 0 0;
  position: relative;
  z-index: 10;
}

.sidebar-resize-handle::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -3px;
  width: 6px;
  background: transparent;
  transition: background-color 0.2s;
}

.sidebar-resize-handle:hover::before,
.sidebar-resize-handle.resizing::before {
  background-color: var(--sidebar-resizer-hover);
}
</style>
