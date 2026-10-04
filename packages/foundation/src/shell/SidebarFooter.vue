<template>
  <div class="sidebar-footer">
    <span class="sidebar-footer-brand">{{ brand }}</span>
    <div ref="wrapperRef" class="sidebar-footer-menu">
      <div
        class="sidebar-footer-gear"
        :class="{ active: showMenu }"
        :title="menuTitle"
        @click.stop="showMenu = !showMenu"
      >
        <svg viewBox="0 0 1024 1024" fill="currentColor" width="16" height="16">
          <path d="M919.6 405.6l-57.2-8c-12.7-1.8-23-10.4-28-22.1-11.3-26.7-25.7-51.7-42.9-74.5-7.7-10.2-10-23.5-5.2-35.3l21.7-53.5c6.7-16.4 0.2-35.3-15.2-44.1L669.1 96.6c-15.4-8.9-34.9-5.1-45.8 8.9l-35.4 45.3c-7.9 10.2-20.7 14.9-33.5 13.3-14-1.8-28.3-2.8-42.8-2.8-14.5 0-28.8 1-42.8 2.8-12.8 1.6-25.6-3.1-33.5-13.3l-35.4-45.3c-10.9-14-30.4-17.8-45.8-8.9L230.4 168c-15.4 8.9-21.8 27.7-15.2 44.1l21.7 53.5c4.8 11.9 2.5 25.1-5.2 35.3-17.2 22.8-31.7 47.8-42.9 74.5-5 11.8-15.3 20.4-28 22.1l-57.2 8C86 408 72.9 423 72.9 440.8v142.9c0 17.7 13.1 32.7 30.6 35.2l57.2 8c12.7 1.8 23 10.4 28 22.1 11.3 26.7 25.7 51.7 42.9 74.5 7.7 10.2 10 23.5 5.2 35.3l-21.7 53.5c-6.7 16.4-0.2 35.3 15.2 44.1L354 927.8c15.4 8.9 34.9 5.1 45.8-8.9l35.4-45.3c7.9-10.2 20.7-14.9 33.5-13.3 14 1.8 28.3 2.8 42.8 2.8 14.5 0 28.8-1 42.8-2.8 12.8-1.6 25.6 3.1 33.5 13.3l35.4 45.3c10.9 14 30.4 17.8 45.8 8.9l123.7-71.4c15.4-8.9 21.8-27.7 15.2-44.1l-21.7-53.5c-4.8-11.8-2.5-25.1 5.2-35.3 17.2-22.8 31.7-47.8 42.9-74.5 5-11.8 15.3-20.4 28-22.1l57.2-8c17.6-2.5 30.6-17.5 30.6-35.2V440.8c0.2-17.8-12.9-32.8-30.5-35.2z m-408 245.5c-76.7 0-138.9-62.2-138.9-138.9s62.2-138.9 138.9-138.9 138.9 62.2 138.9 138.9-62.2 138.9-138.9 138.9z"/>
        </svg>
      </div>
      <Transition name="sidebar-footer-fade">
        <div v-if="showMenu" class="sidebar-footer-dropdown" @click.stop>
          <template v-for="(item, index) in items" :key="item.divider ? `d-${index}` : item.id">
            <div v-if="item.divider" class="sidebar-footer-divider"></div>
            <div v-else class="sidebar-footer-item" @click="handleCommand(item.id ?? '')">
              {{ item.label }}
            </div>
          </template>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * SidebarFooter — 侧边栏底部工具栏：品牌名 + 设置齿轮下拉菜单。
 *
 * 菜单项与品牌文案全部经 props 注入（基础层零业务/i18n 依赖），
 * 宿主通过 `command` 事件接收菜单指令 id。
 */
interface SidebarFooterItem {
  /** 菜单项指令 id（divider 项无需提供） */
  id?: string
  /** 菜单项文案 */
  label?: string
  /** 是否为分隔线 */
  divider?: boolean
}

withDefaults(
  defineProps<{
    /** 品牌名（如 SuperStudio） */
    brand: string
    /** 菜单项列表，支持 { divider: true } 分隔线 */
    items?: SidebarFooterItem[]
    /** 齿轮按钮悬浮提示 */
    menuTitle?: string
  }>(),
  {
    items: () => [],
    menuTitle: 'Settings'
  }
)

const emit = defineEmits<{ command: [id: string] }>()

const showMenu = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)

const handleCommand = (id: string): void => {
  showMenu.value = false
  emit('command', id)
}

const handleDocumentClick = (event: MouseEvent): void => {
  if (!showMenu.value) return
  const target = event.target as HTMLElement | null
  if (target && wrapperRef.value?.contains(target)) return
  showMenu.value = false
}

onMounted(() => document.addEventListener('click', handleDocumentClick, true))
onBeforeUnmount(() => document.removeEventListener('click', handleDocumentClick, true))
</script>

<style scoped>
.sidebar-footer {
  flex-shrink: 0;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-top: 1px solid var(--sidebar-footer-border, var(--sidebar-border, #1a1a1a));
  background: var(--sidebar-footer-bg, var(--sidebar-bg, #252526));
}

.sidebar-footer-brand {
  color: var(--text-sidebar-brand, var(--sidebar-item-active-color, #ffc107));
  font-weight: 700;
  font-size: 13px;
}

.sidebar-footer-menu {
  position: relative;
}

.sidebar-footer-gear {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: var(--sidebar-menu-btn, #888888);
  cursor: pointer;
  transition: all 0.15s;
}

.sidebar-footer-gear:hover,
.sidebar-footer-gear.active {
  background-color: var(--sidebar-menu-btn-hover-bg, rgba(255, 255, 255, 0.1));
  color: var(--sidebar-menu-btn-hover-color, #e0e0e0);
}

.sidebar-footer-dropdown {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 4px;
  background-color: var(--menu-bg-color, var(--bg-tertiary, #2d2d30));
  border: 1px solid var(--menu-border-color, var(--border-secondary, #404040));
  border-radius: var(--menu-border-radius, 6px);
  box-shadow: var(--menu-box-shadow, 0 4px 16px rgba(0, 0, 0, 0.5));
  padding: 4px 0;
  min-width: 140px;
  z-index: 10000;
}

.sidebar-footer-item {
  padding: var(--menu-item-padding, 8px 16px);
  font-size: var(--menu-item-font-size, 13px);
  color: var(--menu-item-color, var(--text-secondary, #e0e0e0));
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.sidebar-footer-item:hover {
  background-color: var(--menu-item-hover-bg, #094771);
  color: var(--menu-item-hover-color, #ffffff);
}

.sidebar-footer-divider {
  height: 1px;
  background-color: var(--menu-divider-color, var(--border-secondary, #3a3a3a));
  margin: var(--menu-divider-margin, 4px 0);
}

/* 下拉过渡动画 */
.sidebar-footer-fade-enter-active,
.sidebar-footer-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.sidebar-footer-fade-enter-from,
.sidebar-footer-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
