<template>
  <aside
    v-show="visible"
    class="sidebar-layout"
    :style="{ width: `${width}px`, minWidth: `${minWidth}px`, maxWidth: `${maxWidth}px` }"
  >
    <div class="sidebar-layout-content"><slot /></div>
    <footer v-if="$slots.footer" class="sidebar-layout-footer"><slot name="footer" /></footer>
  </aside>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  visible: boolean
  width: number
  minWidth?: number
  maxWidth?: number
}>(), {
  minWidth: 200,
  maxWidth: 500
})
</script>

<style scoped>
.sidebar-layout { height: 100%; overflow: hidden; flex-shrink: 0; box-sizing: border-box; display: flex; flex-direction: column; }
.sidebar-layout-content { width: 100%; min-height: 0; flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.sidebar-layout-footer { flex-shrink: 0; }
</style>
