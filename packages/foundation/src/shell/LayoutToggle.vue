<template>
  <button
    class="layout-toggle"
    :class="{ 'is-visible': visible }"
    type="button"
    :title="title"
    :aria-label="title"
    :aria-pressed="visible"
    @click="emit('toggle')"
  >
    <svg v-if="variant === 'sidebar'" viewBox="0 0 18 18" aria-hidden="true">
      <rect class="layout-outline" x="2" y="2.5" width="14" height="13" rx="2" />
      <path class="layout-divider" d="M6.5 3v12" />
      <rect class="layout-fill" x="3" y="3.5" width="2.5" height="11" rx="0.75" />
    </svg>
    <svg v-else viewBox="0 0 18 18" aria-hidden="true">
      <rect class="layout-outline" x="2" y="2.5" width="14" height="13" rx="2" />
      <path class="layout-divider" d="M2.5 10.5h13" />
      <rect class="layout-fill" x="3" y="11.5" width="12" height="3" rx="0.75" />
    </svg>
  </button>
</template>

<script setup lang="ts">
/**
 * LayoutToggle — 标题栏布局开关按钮（主侧边栏 / 底部面板）。
 *
 * 视觉与交互完全承袭宿主原版：面板可见时高亮（is-visible），
 * 图标填充块随可见状态加深，aria-pressed 同步可访问性状态。
 */
withDefaults(
  defineProps<{
    /** 图标变体：'sidebar' 主侧边栏 | 'bottom' 底部面板 */
    variant?: 'sidebar' | 'bottom'
    /** 目标面板当前是否可见（决定高亮与 aria-pressed） */
    visible?: boolean
    /** 悬浮提示与 aria-label */
    title?: string
  }>(),
  {
    variant: 'sidebar',
    visible: false,
    title: 'Toggle panel'
  }
)

const emit = defineEmits<{ toggle: [] }>()
</script>

<style scoped>
.layout-toggle {
  width: 28px;
  height: 30px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-titlebar, #cccccc);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  opacity: 0.58;
  transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
  -webkit-app-region: no-drag;
}

.layout-toggle:hover {
  background-color: var(--overlay-hover, rgba(255, 255, 255, 0.1));
  color: var(--text-white, #d4d4d4);
  opacity: 1;
}

.layout-toggle:active {
  background-color: var(--overlay-active, var(--overlay-hover, rgba(255, 255, 255, 0.18)));
}

.layout-toggle:focus-visible {
  outline: 1px solid var(--focus-border-color, #007acc);
  outline-offset: -2px;
}

.layout-toggle.is-visible {
  color: var(--text-white, #d4d4d4);
  opacity: 1;
}

.layout-toggle svg {
  width: 18px;
  height: 18px;
}

.layout-outline,
.layout-divider {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.35;
}

.layout-fill {
  fill: currentColor;
  opacity: 0.18;
  transition: opacity 0.15s ease;
}

.layout-toggle.is-visible .layout-fill {
  opacity: 0.78;
}
</style>
