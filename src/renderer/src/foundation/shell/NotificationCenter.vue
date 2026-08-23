<template>
  <Teleport to="body">
    <div ref="containerRef" class="notification-center" @contextmenu.prevent="showMenu">
      <div
        v-for="item in items"
        :key="item.id"
        class="notification-item"
        :class="{ focused: item.focused }"
        tabindex="0"
        @focusin="item.focused = true"
        @focusout="item.focused = false"
      >
        <button class="notification-close" type="button" aria-label="Dismiss notification" @click="remove(item.id)">✕</button>
        <div class="notification-title">{{ item.title }}<span v-if="item.count > 1" class="notification-count">{{ item.count }}</span></div>
        <div class="notification-message">{{ item.message }}</div>
      </div>
    </div>
    <div v-if="menuVisible" class="context-menu" :style="{ left: `${menuX}px`, top: `${menuY}px` }" @click.stop>
      <div class="menu-item" @click="clearFromMenu">{{ clearAllLabel }}</div>
    </div>
    <div v-if="menuVisible" class="menu-overlay" @click="hideMenu" />
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useNotificationCenter } from './useNotificationCenter'

withDefaults(defineProps<{ clearAllLabel?: string }>(), { clearAllLabel: 'Clear all' })

const containerRef = ref<HTMLElement | null>(null)
const { items, add, remove, clear } = useNotificationCenter(() => {
  if (containerRef.value) containerRef.value.scrollTop = 0
})
const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)

const showMenu = (event: MouseEvent): void => {
  if (items.value.length === 0) return
  menuX.value = event.clientX
  menuY.value = event.clientY
  menuVisible.value = true
}
const hideMenu = (): void => { menuVisible.value = false }
const clearFromMenu = (): void => { clear(); hideMenu() }

defineExpose({ add, remove, clear })
</script>

<style scoped>
.notification-center { position: fixed; right: 10px; top: 30px; bottom: 25px; width: 420px; z-index: 10000; display: flex; flex-direction: column-reverse; overflow-y: scroll; overflow-x: hidden; scrollbar-width: none; -ms-overflow-style: none; pointer-events: none; }
.notification-center::-webkit-scrollbar { display: none; }
.notification-item { position: relative; background: var(--notify-bg); border: 1px solid var(--notify-border); border-radius: 8px; padding: 10px 14px; padding-right: 30px; box-shadow: var(--notify-shadow); margin: 4px 0; min-width: 280px; max-width: 380px; outline: none; pointer-events: auto; }
.notification-item.focused { border-color: var(--focus-border-color); box-shadow: var(--notify-shadow), var(--notify-focus-shadow); }
.notification-close { position: absolute; top: 8px; right: 10px; padding: 0; border: 0; background: transparent; font-size: 14px; color: var(--notify-close-color); cursor: pointer; transition: color 0.2s; }
.notification-close:hover { color: var(--notify-text); }
.notification-title { font-size: 13px; font-weight: 600; color: var(--notify-text); margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
.notification-count { font-size: 11px; font-weight: 500; color: var(--notify-meta); background: var(--notify-meta-bg); border-radius: 10px; padding: 1px 7px; line-height: 1.4; }
.notification-message { font-size: 12px; color: var(--notify-empty); word-break: break-all; line-height: 1.4; }
.context-menu { position: fixed; z-index: 10001; }
.menu-overlay { position: fixed; inset: 0; z-index: 10000; }
</style>
