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
        <div class="notify-title">{{ notify.title }}<span v-if="notify.count > 1" class="notify-count">{{ notify.count }}</span></div>
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
        <div class="menu-item" @click="handleClearAll">{{ t('terminal.clearAll') }}</div>
      </div>
      <div v-if="menuVisible" class="menu-overlay" @click="hideMenu" />
    </Teleport>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

export interface NotifyItem {
  id: number
  title: string
  message: string
  focused: boolean
  count: number
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
  // 查找相同 title 和 message 的已有通知
  const existing = notifies.value.find((n) => n.title === title && n.message === message)
  if (existing) {
    existing.count++
    // 将已有通知移到最前面
    const index = notifies.value.indexOf(existing)
    if (index > 0) {
      notifies.value.splice(index, 1)
      notifies.value.unshift(existing)
    }
    nextTick(() => {
      if (containerRef.value) {
        containerRef.value.scrollTop = 0
      }
    })
    return existing.id
  }
  const id = ++idCounter
  notifies.value.unshift({ id, title, message, focused: false, count: 1 })
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
  background: var(--notify-bg);
  border: 1px solid var(--notify-border);
  border-radius: 8px;
  padding: 10px 14px;
  padding-right: 30px;
  box-shadow: var(--notify-shadow);
  margin: 4px 0;
  min-width: 280px;
  max-width: 380px;
  outline: none;
  pointer-events: auto;
}

.notify-item.focused {
  border-color: var(--focus-border-color);
  box-shadow: var(--notify-shadow), var(--notify-focus-shadow);
}

.notify-close {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 14px;
  color: var(--notify-close-color);
  cursor: pointer;
  transition: color 0.2s;
}

.notify-close:hover {
  color: var(--notify-text);
}

.notify-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--notify-text);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.notify-count {
  font-size: 11px;
  font-weight: 500;
  color: var(--notify-meta);
  background: var(--notify-meta-bg);
  border-radius: 10px;
  padding: 1px 7px;
  line-height: 1.4;
}

.notify-message {
  font-size: 12px;
  color: var(--notify-empty);
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
