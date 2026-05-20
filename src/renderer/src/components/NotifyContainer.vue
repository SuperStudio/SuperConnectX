<template>
  <Teleport to="body">
    <div
      class="notify-container"
      ref="containerRef"
      @contextmenu.prevent="showMenu"
    >
      <div
        v-for="notify in notifies"
        :key="notify.id"
        class="notify-item"
        :class="{ focused: notify.focused }"
        @focusin="notify.focused = true"
        @focusout="notify.focused = false"
        tabindex="0"
      >
        <div class="notify-close" @click="remove(notify.id)">✕</div>
        <div class="notify-title">{{ notify.title }}</div>
        <div class="notify-message">{{ notify.message }}</div>
      </div>
    </div>
    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="menuVisible"
        class="context-menu"
        :style="{ left: menuX + 'px', top: menuY + 'px' }"
        @click.stop
      >
        <div class="menu-item" @click="handleClearAll">清空全部</div>
      </div>
      <div v-if="menuVisible" class="menu-overlay" @click="hideMenu" />
    </Teleport>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'

export interface NotifyItem {
  id: number
  title: string
  message: string
  focused: boolean
}

const notifies = ref<NotifyItem[]>([])
const containerRef = ref<HTMLElement | null>(null)
let idCounter = 0

// 右键菜单
const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)

const showMenu = (e: MouseEvent) => {
  if (notifies.value.length === 0) return
  menuX.value = e.clientX
  menuY.value = e.clientY
  menuVisible.value = true
}

const hideMenu = () => {
  menuVisible.value = false
}

const handleClearAll = () => {
  clear()
  hideMenu()
}

const add = (title: string, message: string) => {
  const id = ++idCounter
  notifies.value.push({ id, title, message, focused: false })
  nextTick(() => {
    if (containerRef.value) {
      containerRef.value.scrollTop = 0
    }
  })
  return id
}

const remove = (id: number) => {
  const index = notifies.value.findIndex((n) => n.id === id)
  if (index > -1) {
    notifies.value.splice(index, 1)
  }
}

const clear = () => {
  notifies.value = []
}

defineExpose({ add, remove, clear })
</script>

<style scoped>
.notify-container {
  position: fixed;
  right: 10px;
  top: 30px;
  bottom: 25px;
  width: 420px;
  z-index: 10000;
  display: flex;
  flex-direction: column-reverse;
  overflow-y: scroll;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  pointer-events: none;
}

.notify-container::-webkit-scrollbar {
  display: none;
}

.notify-item {
  position: relative;
  background: #252526;
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  padding: 10px 14px;
  padding-right: 30px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  margin: 4px 0;
  min-width: 280px;
  max-width: 380px;
  outline: none;
  pointer-events: auto;
}

.notify-item.focused {
  border-color: #165dff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 2px rgba(22, 93, 255, 0.3);
}

.notify-close {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 14px;
  color: #888;
  cursor: pointer;
  transition: color 0.2s;
}

.notify-close:hover {
  color: #fff;
}

.notify-title {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
}

.notify-message {
  font-size: 12px;
  color: #aaa;
  word-break: break-all;
  line-height: 1.4;
}

/* 右键菜单 - 使用全局统一样式 */
.context-menu {
  position: fixed;
  z-index: 10001;
}

.menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10000;
}
</style>
