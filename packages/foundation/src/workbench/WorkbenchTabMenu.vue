<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="menuRef"
      class="workbench-tab-menu"
      :style="{ left: `${position.x}px`, top: `${position.y}px` }"
      @click.stop
    >
      <!-- 应用专属前置项（如断开全部连接）；宿主可使用 .menu-item / .menu-divider -->
      <slot name="prepend" />

      <div class="menu-item" @click="emit('close')">{{ labels.close }}</div>
      <div class="menu-item" @click="emit('closeOther')">{{ labels.closeOther }}</div>
      <div class="menu-item" @click="emit('closeLeft')">{{ labels.closeLeft }}</div>
      <div class="menu-item" @click="emit('closeRight')">{{ labels.closeRight }}</div>
      <div class="menu-item danger" @click="emit('closeAll')">{{ labels.closeAll }}</div>

      <div class="menu-divider" />

      <div class="menu-item" @click="emit('moveToFirst')">{{ labels.moveToFirst }}</div>
      <div class="menu-item" @click="emit('moveToLast')">{{ labels.moveToLast }}</div>

      <div class="menu-divider" />

      <!-- 应用专属中置项（如拆分到新面板）；宿主可使用 .menu-item / .menu-divider -->
      <slot name="middle" />

      <div class="menu-item" @click="emit('togglePin')">
        {{ pinned ? labels.unpin : labels.pin }}
      </div>

      <!-- 应用专属后置项（如编辑备注） -->
      <slot name="append" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * WorkbenchTabMenu — 选项卡通用右键菜单（Teleport 到 body）。
 *
 * 内置通用项：关闭 / 关闭其他 / 关闭左侧 / 关闭右侧 / 关闭全部（危险色）、
 * 移到最前 / 移到最后、固定/取消固定。文案经 `labels` prop 注入（默认英文）。
 * 应用专属项经 `#prepend` / `#append` 插槽插入，可直接使用 `.menu-item`
 * 与 `.menu-divider` 类名（经 :slotted 样式支持）。
 * 点击菜单外部自动上抛 `hide`。
 */
interface WorkbenchTabMenuLabels {
  close?: string
  closeOther?: string
  closeLeft?: string
  closeRight?: string
  closeAll?: string
  moveToFirst?: string
  moveToLast?: string
  pin?: string
  unpin?: string
}

const props = withDefaults(
  defineProps<{
    /** 是否显示 */
    visible?: boolean
    /** 菜单左上角屏幕坐标 */
    position?: { x: number; y: number }
    /** 右键的选项卡当前是否已固定（决定固定/取消固定文案） */
    pinned?: boolean
    /** 菜单文案（默认英文） */
    labels?: WorkbenchTabMenuLabels
  }>(),
  {
    visible: false,
    position: () => ({ x: 0, y: 0 }),
    pinned: false,
    labels: () => ({})
  }
)

const emit = defineEmits<{
  close: []
  closeOther: []
  closeLeft: []
  closeRight: []
  closeAll: []
  moveToFirst: []
  moveToLast: []
  togglePin: []
  hide: []
}>()

const label = (key: keyof WorkbenchTabMenuLabels, fallback: string): string =>
  props.labels[key] ?? fallback

// 导出给模板使用的完整文案（保持响应式：labels 为响应式 prop）
const labels = {
  get close() { return label('close', 'Close') },
  get closeOther() { return label('closeOther', 'Close Others') },
  get closeLeft() { return label('closeLeft', 'Close to the Left') },
  get closeRight() { return label('closeRight', 'Close to the Right') },
  get closeAll() { return label('closeAll', 'Close All') },
  get moveToFirst() { return label('moveToFirst', 'Move to First') },
  get moveToLast() { return label('moveToLast', 'Move to Last') },
  get pin() { return label('pin', 'Pin Tab') },
  get unpin() { return label('unpin', 'Unpin Tab') }
}

const menuRef = ref<HTMLElement | null>(null)

// 点击菜单外部才隐藏；点击菜单内部（各菜单项）由对应动作自行关闭，
// 避免捕获阶段提前卸载菜单导致动作处理器不执行。
const handleDocumentClick = (event: MouseEvent): void => {
  if (!props.visible) return
  const target = event.target as HTMLElement | null
  if (target && menuRef.value?.contains(target)) return
  emit('hide')
}

onMounted(() => document.addEventListener('click', handleDocumentClick, true))
onBeforeUnmount(() => document.removeEventListener('click', handleDocumentClick, true))
</script>

<style scoped>
.workbench-tab-menu {
  position: fixed;
  background-color: var(--menu-bg-color, var(--bg-tertiary, #2d2d2d));
  border: 1px solid var(--menu-border-color, #3a3a3a);
  border-radius: var(--menu-border-radius, 6px);
  box-shadow: var(--menu-box-shadow, 0 4px 16px rgba(0, 0, 0, 0.5));
  padding: 4px 0;
  min-width: 120px;
  z-index: 10000;
}

.menu-item {
  padding: var(--menu-item-padding, 8px 16px);
  color: var(--menu-item-color, #e0e0e0);
  font-size: var(--menu-item-font-size, 13px);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.menu-item:hover {
  background-color: var(--menu-item-hover-bg, #094771);
  color: var(--menu-item-hover-color, #fff);
}

.menu-item.danger {
  color: var(--menu-danger-color, #f56c6c);
}

.menu-item.danger:hover {
  background-color: var(--menu-danger-hover-bg, #f56c6c);
  color: var(--text-white, #fff);
}

.menu-divider {
  height: 1px;
  background-color: var(--menu-divider-color, #3a3a3a);
  margin: var(--menu-divider-margin, 4px 0);
}

/* 插槽内宿主自定义项沿用同一菜单样式 */
:slotted(.menu-item) {
  padding: var(--menu-item-padding, 8px 16px);
  color: var(--menu-item-color, #e0e0e0);
  font-size: var(--menu-item-font-size, 13px);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

:slotted(.menu-item:hover) {
  background-color: var(--menu-item-hover-bg, #094771);
  color: var(--menu-item-hover-color, #fff);
}

:slotted(.menu-divider) {
  height: 1px;
  background-color: var(--menu-divider-color, #3a3a3a);
  margin: var(--menu-divider-margin, 4px 0);
}
</style>
