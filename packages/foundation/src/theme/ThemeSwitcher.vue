<template>
  <div ref="wrapperRef" class="theme-switcher">
    <button
      class="theme-switcher-btn"
      type="button"
      :title="title"
      :aria-label="title"
      :aria-expanded="showPanel"
      @click="togglePanel"
    >
      <svg
        viewBox="0 0 1024 1024"
        width="16"
        height="16"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M328.147627 164.706987h67.403093c4.973227 2.94912 12.22656 4.068693 16.75264 7.5776 6.161067 4.734293 10.58816 10.738347 15.407787 16.892586 6.509227 8.2944 18.7904 16.3328 29.125973 20.657494 12.079787 4.98688 24.90368 7.8336 39.717547 10.581333 4.672853 0.303787 9.345707 0.508587 14.015146 0.812373 6.263467 0.965973 15.213227-0.559787 20.3776-1.62816 27.886933-5.597867 41.857707-10.175147 60.197547-24.726186 7.15776-5.748053 10.98752-15.213227 18.438827-20.70528 4.17792-2.286933 8.400213-4.67968 12.62592-7.021227 3.628373-1.42336 6.212267-0.610987 9.19552-2.440533h19.831466c19.135147 0 47.571627-2.594133 60.197547 4.017493 8.895147 4.78208 15.70816 12.311893 22.667947 19.07712 9.693867 9.41056 19.38432 18.824533 29.026986 28.235093 31.26272 30.47424 62.580053 60.89728 93.794987 91.37152 9.844053 10.530133 21.22752 19.636907 31.020373 30.221654 8.04864 8.495787 16.59904 14.854827 21.02272 27.163306 0.150187 1.98656 0.201387 3.969707 0.249174 5.956267 2.235733 13.431467-3.877547 23.197013-10.042027 30.982827-26.19392 25.38496-52.391253 50.82112-78.63296 76.158293-9.54368 10.635947-21.47328 25.439573-38.324907 28.53888-22.96832 4.225707-35.986773-9.919147-46.721706-20.34688-3.4816-3.457707-6.413653-7.8848-10.93632-10.379947-0.197973 0.2048-0.546133 0.4096-0.846507 0.5632v272.182614c-0.047787 25.53856-0.146773 51.17952-0.293547 76.71808-1.839787 8.8576-7.60832 18.01216-13.919573 22.84544-15.755947 11.905707-43.543893 9.25696-71.427413 9.25696H371.2c-19.43552 0-39.867733 1.47456-51.49696-6.048427-6.51264-4.072107-13.6704-11.70432-16.554667-19.28192-3.280213-8.751787-2.484907-20.964693-2.484906-32.6144v-51.38432-271.981227h-1.143467c-11.58144 10.175147-20.48 22.79424-36.037973 29.15328-13.21984 5.440853-28.678827-0.252587-36.928854-5.952853-5.76512-4.068693-10.141013-9.311573-15.110826-14.144853a23320.081067 23320.081067 0 0 0-35.488427-33.98656 1789.088427 1789.088427 0 0 1-16.800427-16.940374c-6.908587-5.799253-12.92288-12.417707-19.285333-18.722133-7.703893-7.529813-16.104107-13.380267-20.72576-23.965013-1.989973-4.478293-5.915307-12.56448-4.47488-20.094294 3.382613-17.855147 14.465707-27.26912 25.746773-37.290666 6.710613-5.901653 12.62592-12.76928 19.285334-18.71872l111.09376-108.21632c6.710613-6.509227 13.421227-13.021867 20.13184-19.585707 9.741053-9.458347 18.438827-21.162667 37.229226-21.77024-0.006827-0.3584-0.006827-0.662187-0.006826-1.017173z" fill="currentColor"></path>
      </svg>
    </button>
    <!-- 皮肤选择悬浮面板 -->
    <Transition name="theme-switcher-fade">
      <div v-if="showPanel" class="theme-switcher-panel" @click.stop>
        <div class="theme-switcher-panel-title">{{ panelTitle }}</div>
        <div class="theme-switcher-options">
          <div
            v-for="option in themeOptions"
            :key="option.value"
            class="theme-switcher-option"
            :class="{ active: activeTheme === option.value }"
            @click="selectTheme(option.value)"
          >
            <div class="theme-switcher-preview" :class="`theme-switcher-preview-${option.value}`">
              <div class="preview-bar"></div>
              <div class="preview-content">
                <div class="preview-sidebar"></div>
                <div class="preview-main"></div>
              </div>
            </div>
            <span class="theme-switcher-label">{{ option.label }}</span>
            <span v-if="activeTheme === option.value" class="theme-switcher-check">✓</span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTheme, type AppTheme, type ThemeController } from './useTheme'

/**
 * ThemeSwitcher — 标题栏换肤组件（按钮 + 深浅色预览面板）。
 *
 * 标签文案全部通过 props 注入（基础层不含 i18n）；默认内部创建 useTheme 控制器，
 * 也可通过 `controller` 注入宿主已有的 ThemeController，实现与状态栏等其他
 * 消费方共享同一份主题状态。
 */
const props = withDefaults(
  defineProps<{
    /** 按钮悬浮提示与 aria-label */
    title?: string
    /** 面板标题 */
    panelTitle?: string
    /** 深色选项文案 */
    darkLabel?: string
    /** 浅色选项文案 */
    lightLabel?: string
    /** 内部控制器使用的 localStorage 键（传入 controller 时忽略） */
    storageKey?: string
    /** 内部控制器的默认主题（传入 controller 时忽略） */
    defaultTheme?: AppTheme
    /** 外部注入的主题控制器（与其他消费方共享状态） */
    controller?: ThemeController
  }>(),
  {
    title: 'Switch theme',
    panelTitle: 'Theme',
    darkLabel: 'Dark',
    lightLabel: 'Light',
    storageKey: 'app-theme',
    defaultTheme: 'dark'
  }
)

const emit = defineEmits<{ change: [theme: AppTheme] }>()

const internalTheme = useTheme({ storageKey: props.storageKey, defaultTheme: props.defaultTheme })
const controller = computed<ThemeController>(() => props.controller ?? internalTheme)

const activeTheme = computed<AppTheme>(() => controller.value.theme.value)

const themeOptions = computed(() => [
  { value: 'dark' as const, label: props.darkLabel },
  { value: 'light' as const, label: props.lightLabel }
])

// ---- 面板开关与外部点击关闭 ----
const showPanel = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)

const togglePanel = (): void => {
  showPanel.value = !showPanel.value
}

const selectTheme = (theme: AppTheme): void => {
  controller.value.applyTheme(theme)
  emit('change', theme)
  showPanel.value = false
}

const handleDocumentClick = (event: MouseEvent): void => {
  if (!showPanel.value) return
  const target = event.target as HTMLElement | null
  if (target && wrapperRef.value?.contains(target)) return
  showPanel.value = false
}

onMounted(() => document.addEventListener('click', handleDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', handleDocumentClick))
</script>

<style scoped>
.theme-switcher {
  position: relative;
  -webkit-app-region: no-drag;
}

.theme-switcher-btn {
  width: 40px;
  height: 30px;
  padding: 0;
  background: none;
  border: none;
  color: var(--text-titlebar, #cccccc);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.theme-switcher-btn:hover {
  color: var(--text-white);
  background-color: var(--overlay-hover);
}

.theme-switcher-btn:focus {
  outline: none;
}

.theme-switcher-panel {
  position: absolute;
  top: 100%;
  right: 0;
  width: 210px;
  background-color: var(--menu-bg-color, var(--bg-tertiary, #2d2d30));
  border: 1px solid var(--menu-border-color, var(--border-secondary, #404040));
  border-radius: var(--menu-border-radius, 6px);
  box-shadow: var(--menu-box-shadow, 0 4px 12px rgba(0, 0, 0, 0.3));
  padding: 12px;
  z-index: 10001;
}

.theme-switcher-panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--menu-item-color, var(--text-secondary, #b5b5b5));
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--menu-divider-color, var(--border-secondary, #404040));
}

.theme-switcher-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.theme-switcher-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  position: relative;
}

.theme-switcher-option:hover {
  background-color: var(--menu-item-hover-bg, var(--overlay-hover));
}

.theme-switcher-option.active {
  background-color: var(--accent-blue-subtle, rgba(0, 122, 204, 0.15));
}

.theme-switcher-preview {
  width: 40px;
  height: 28px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--menu-border-color, var(--border-secondary, #404040));
  flex-shrink: 0;
}

.theme-switcher-preview-dark {
  background: #1e1e1e;
}

.theme-switcher-preview-dark .preview-bar {
  height: 6px;
  background: #323233;
}

.theme-switcher-preview-dark .preview-content {
  display: flex;
  height: 22px;
}

.theme-switcher-preview-dark .preview-sidebar {
  width: 10px;
  background: #252526;
  border-right: 1px solid #333;
}

.theme-switcher-preview-dark .preview-main {
  flex: 1;
  background: #1e1e1e;
}

.theme-switcher-preview-light {
  background: #f5f5f5;
}

.theme-switcher-preview-light .preview-bar {
  height: 6px;
  background: #e0e0e0;
}

.theme-switcher-preview-light .preview-content {
  display: flex;
  height: 22px;
}

.theme-switcher-preview-light .preview-sidebar {
  width: 10px;
  background: #ffffff;
  border-right: 1px solid #d0d0d0;
}

.theme-switcher-preview-light .preview-main {
  flex: 1;
  background: #f5f5f5;
}

.theme-switcher-label {
  font-size: 12px;
  color: var(--menu-item-color, var(--text-secondary, #b5b5b5));
  flex: 1;
}

.theme-switcher-check {
  color: var(--btn-icon-text, var(--btn-primary, #0e639c));
  font-size: 12px;
  font-weight: bold;
}

/* 面板过渡动画 */
.theme-switcher-fade-enter-active,
.theme-switcher-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.theme-switcher-fade-enter-from,
.theme-switcher-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
