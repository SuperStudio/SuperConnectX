<template>
  <div ref="containerEl" class="xterm-host" @contextmenu.prevent="openContextMenu"></div>

  <!-- 右键菜单：teleport 到 body，避免被终端容器的 overflow 裁剪 -->
  <Teleport to="body">
    <div
      v-if="menu.visible"
      ref="menuEl"
      class="xterm-context-menu"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
      @contextmenu.prevent
      @mousedown.stop
    >
      <div class="menu-item" :class="menuClass(!menu.hasSelection)" @click="copySelection">
        {{ t('terminal.copy') }}
      </div>
      <div class="menu-item" :class="menuClass(props.disabled)" @click="pasteFromClipboard">
        {{ t('terminal.paste') }}
      </div>
      <div class="menu-item" @click="selectAll">{{ t('terminal.selectAll') }}</div>
      <div class="menu-item" @click="clearScreen">{{ t('terminal.clear') }}</div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

const { t } = useI18n()

/**
 * XtermTerminal - 真终端模拟组件（终端模式使用）
 *
 * 与日志视图（Monaco + 自研 ANSI 着色）的区别：
 *   - 完整支持 ANSI 控制序列（光标移动 / 清屏 / 行擦除），vim、top、less 等交互式程序可正常工作；
 *   - 用户按键直接产生字节流（含 Ctrl+C 的 \x03），经 onData 原样发往远端 PTY；
 *   - 容器尺寸变化时自动 fit 并把最新 rows/cols 通知出去，服务端据此重排（SIGWINCH）。
 */
const props = withDefaults(
  defineProps<{
    fontSize?: number
    fontFamily?: string
    /** 初始欢迎/提示文本，连接建立前的占位 */
    initMessage?: string
    disabled?: boolean
  }>(),
  {
    fontSize: 14,
    fontFamily: '',
    initMessage: '',
    disabled: false
  }
)

const emit = defineEmits<{
  /** 用户按键产生的原始字节流，需以 raw 方式发送 */
  data: [payload: string]
  /** 可视行列变化，用于同步远端 PTY */
  resize: [rows: number, cols: number]
}>()

const containerEl = ref<HTMLElement | null>(null)
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let lastRows = 0
let lastCols = 0

/** 主题：跟随应用 CSS 变量，避免两种模式割裂 */
const buildTheme = () => {
  // 读取当前 document 上的 CSS 变量，深色/浅色/自定义绿色主题都能自适应
  const styles = getComputedStyle(document.documentElement)
  const background = styles.getPropertyValue('--bg-editor').trim() || '#1e1e1e'
  const foreground = styles.getPropertyValue('--text-primary').trim() || '#d4d4d4'
  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: styles.getPropertyValue('--el-color-primary').trim() || '#409eff',
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#e5e5e5'
  }
}

/** 重新计算行列；仅在容器真正有尺寸时才 fit，避免隐藏态下算出 0 导致 PTY 异常 */
const refit = () => {
  if (!terminal || !fitAddon || !containerEl.value) return
  const { clientWidth, clientHeight } = containerEl.value
  if (clientWidth <= 0 || clientHeight <= 0) return
  try {
    fitAddon.fit()
  } catch {
    // 容器尚未完成布局时 fit 可能抛错，忽略即可，ResizeObserver 会再次触发
    return
  }
  const { rows, cols } = terminal
  if (rows > 0 && cols > 0 && (rows !== lastRows || cols !== lastCols)) {
    lastRows = rows
    lastCols = cols
    emit('resize', rows, cols)
  }
}

onMounted(() => {
  if (!containerEl.value) return

  terminal = new Terminal({
    // 不开启 convertEol：远端 PTY 已经输出 \r\n，再转换会产生空行
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 10000,
    fontSize: props.fontSize,
    fontFamily: props.fontFamily || undefined,
    theme: buildTheme(),
    allowProposedApi: true,
    // Windows 下 ConPTY/openssh 常用 latin1 传输 ANSI，允许透明模式避免字符丢失
    allowTransparency: false
  })

  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(new WebLinksAddon())

  terminal.open(containerEl.value)

  if (props.initMessage) {
    terminal.writeln(props.initMessage)
  }

  // 按键 -> 原始字节流上行
  terminal.onData((data: string) => {
    if (props.disabled) return
    emit('data', data)
  })

  // 尺寸变化 -> fit + 通知服务端
  resizeObserver = new ResizeObserver(() => refit())
  resizeObserver.observe(containerEl.value)

  // 首帧布局完成后再 fit 一次，拿到真实行列并同步给服务端
  requestAnimationFrame(() => refit())

  // 右键菜单的关闭触发器（捕获阶段，保证先于 xterm 自身处理）
  document.addEventListener('mousedown', onDocumentMouseDown, true)
  document.addEventListener('keydown', onDocumentKeyDown, true)
  window.addEventListener('blur', closeMenu)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown, true)
  document.removeEventListener('keydown', onDocumentKeyDown, true)
  window.removeEventListener('blur', closeMenu)
  closeMenu()
  resizeObserver?.disconnect()
  resizeObserver = null
  try {
    terminal?.dispose()
  } catch {
    /* ignore */
  }
  terminal = null
  fitAddon = null
})

watch(
  () => props.fontSize,
  (size) => {
    if (!terminal || !size) return
    terminal.options.fontSize = size
    refit()
  }
)

watch(
  () => props.fontFamily,
  (family) => {
    if (!terminal || !family) return
    terminal.options.fontFamily = family
    refit()
  }
)

/** 写入远端数据（原样交给 xterm 解析 ANSI） */
const write = (data: string | Uint8Array): void => {
  terminal?.write(data)
}

/** 清空终端屏（含回滚区） */
const clear = (): void => {
  terminal?.clear()
}

/** 主动贴合容器（父容器由隐藏变为可见后调用） */
const fit = (): void => {
  refit()
}

/** 重新聚焦到终端，保证按键被 xterm 捕获 */
const focus = (): void => {
  terminal?.focus()
}

// ---------- 右键菜单 ----------
// xterm 不自带右键菜单，Electron 中也没有浏览器默认菜单，
// 因此选中文本后无法复制，这里补齐终端常用的最小集合：复制/粘贴/全选/清空
const menuEl = ref<HTMLElement | null>(null)
const menu = reactive({ visible: false, x: 0, y: 0, hasSelection: false })

/** 不可用时置灰（未选中文本时复制、未连接时粘贴） */
const menuClass = (disabled: boolean) => (disabled ? 'disabled' : '')

const closeMenu = () => {
  menu.visible = false
}

const openContextMenu = async (e: MouseEvent) => {
  menu.hasSelection = terminal?.hasSelection() ?? false
  menu.x = e.clientX
  menu.y = e.clientY
  menu.visible = true
  // 渲染后按实际尺寸校正，避免菜单被窗口右/下边缘截断
  await nextTick()
  const el = menuEl.value
  if (el) {
    const { offsetWidth, offsetHeight } = el
    if (menu.x + offsetWidth > window.innerWidth) {
      menu.x = Math.max(0, window.innerWidth - offsetWidth - 4)
    }
    if (menu.y + offsetHeight > window.innerHeight) {
      menu.y = Math.max(0, window.innerHeight - offsetHeight - 4)
    }
  }
}

/** 复制选中内容；xterm 已按终端语义处理好换行与尾部空格 */
const copySelection = async () => {
  const text = terminal?.getSelection()
  closeMenu()
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // 非安全上下文（file://）下 clipboard API 可能不可用，退回 execCommand
    try {
      document.execCommand('copy')
    } catch {
      /* ignore */
    }
  }
}

/** 粘贴：等价于把剪贴板内容作为按键流发给远端 */
const pasteFromClipboard = async () => {
  closeMenu()
  if (props.disabled) return
  try {
    const text = await navigator.clipboard.readText()
    if (text) emit('data', text)
  } catch {
    /* 读取剪贴板被拒绝时静默忽略 */
  }
  terminal?.focus()
}

const selectAll = () => {
  closeMenu()
  terminal?.selectAll()
}

const clearScreen = () => {
  closeMenu()
  terminal?.clear()
}

/** 点击别处 / 滚动 / 失焦 / Esc 关闭菜单 */
const onDocumentMouseDown = (e: MouseEvent) => {
  if (!menu.visible) return
  if (menuEl.value && menuEl.value.contains(e.target as Node)) return
  closeMenu()
}
const onDocumentKeyDown = (e: KeyboardEvent) => {
  if (menu.visible && e.key === 'Escape') closeMenu()
}

/** 当前可视行列，供连线时作为 PTY 初始尺寸上报 */
const getDimensions = (): { rows: number; cols: number } => ({
  rows: terminal?.rows || 24,
  cols: terminal?.cols || 80
})

defineExpose({ write, clear, fit, focus, getDimensions })
</script>

<style scoped>
.xterm-host {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* xterm 默认有 2px padding，这里贴合 Monaco 输出区的观感 */
.xterm-host :deep(.xterm-viewport) {
  background-color: transparent !important;
}

/* 终端右键菜单：与 Tab/标题栏菜单同一套主题变量（assets/color.css 的 --menu-*），
   深色/浅色/自定义绿色主题自动跟随 */
.xterm-context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 120px;
  padding: 4px 0;
  border-radius: var(--menu-border-radius, 6px);
  border: 1px solid var(--menu-border-color, #dcdfe6);
  background-color: var(--menu-bg-color, #ffffff);
  box-shadow: var(--menu-box-shadow, 0 4px 16px rgba(0, 0, 0, 0.2));
  user-select: none;
}

.xterm-context-menu .menu-item {
  padding: var(--menu-item-padding, 6px 16px);
  font-size: var(--menu-item-font-size, 13px);
  color: var(--menu-item-color, #606266);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.xterm-context-menu .menu-item:hover {
  background-color: var(--menu-item-hover-bg, #f5f7fa);
  color: var(--menu-item-hover-color, #303133);
}

.xterm-context-menu .menu-item.disabled {
  opacity: 0.45;
  cursor: default;
}

.xterm-context-menu .menu-item.disabled:hover {
  background-color: transparent;
  color: var(--menu-item-color, #606266);
}
</style>
