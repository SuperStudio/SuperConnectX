<template>
  <div class="custom-titlebar">
    <div class="titlebar-left">
      <button
        class="titlebar-btn toggle-connection-btn"
        @click="toggleConnectionList"
        :class="{ toggled: !showConnectionList }"
      >
        <svg
          viewBox="0 0 1024 1024"
          fill="white"
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
        >
          <path
            d="M901.632 896H122.368c-30.72 0-55.808-25.088-55.808-55.808v-1.536c0-30.72 25.088-55.808 55.808-55.808h779.776c30.72 0 55.808 25.088 55.808 55.808v1.536c-0.512 30.72-25.6 55.808-56.32 55.808zM901.632 568.32H122.368c-30.72 0-55.808-25.088-55.808-55.808v-1.536c0-30.72 25.088-55.808 55.808-55.808h779.776c30.72 0 55.808 25.088 55.808 55.808v1.536c-0.512 30.72-25.6 55.808-56.32 55.808zM901.632 240.64H122.368c-30.72 0-55.808-25.088-55.808-55.808v-1.536c0-30.72 25.088-55.808 55.808-55.808h779.776c30.72 0 55.808 25.088 55.808 55.808v1.536c-0.512 30.72-25.6 55.808-56.32 55.808z"
            p-id="15235"
          ></path>
        </svg>
      </button>
      <div class="app-logo">
        <img class="logo-img" src="../assets/icon.png" alt="App Icon" />
      </div>
      <div class="app-title">SuperConnectX</div>

      <div
        class="menu-button"
        @mouseenter="((showFileMenu = true), (showEditMenu = false), (showToolsMenu = false), (showHelpMenu = false))"
      >
        <button class="menu-btn">{{ t('titlebar.file') }}</button>
        <div
          class="dropdown-menu"
          v-if="showFileMenu"
          @mouseenter="handleDropdownMouseEnter('file')"
          @mouseleave="hideFileMenu"
        >
          <div class="menu-item" @click="importData">{{ t('titlebar.importData') }}</div>
          <div class="menu-item" @click="exportData">{{ t('titlebar.exportData') }}</div>
          <div class="menu-item" @click="importFromSuperCom">{{ t('titlebar.importFromSuperCom') }}</div>
          <div class="menu-separator"></div>
          <div class="menu-item" @click="openAppDir">{{ t('titlebar.openAppDir') }}</div>
          <div class="menu-item" @click="openUserDataDir">{{ t('titlebar.openUserDataDir') }}</div>
          <div class="menu-separator"></div>
          <div class="menu-item" @click="handleExit">{{ t('titlebar.exit') }}</div>
        </div>
      </div>

      <div
        class="menu-button"
        @mouseenter="handleMenuMouseEnter('edit')"
        @mouseleave="handleMenuMouseLeave('edit')"
      >
        <button class="menu-btn">{{ t('titlebar.edit') }}</button>
        <div class="dropdown-menu" v-if="showEditMenu"
          @mouseenter="handleDropdownMouseEnter('edit')"
          @mouseleave="handleDropdownMouseLeave('edit')"
        >
          <div class="menu-item checkbox-item" @click.stop="toggleWordWrap">
            <span class="checkbox-mark">{{ wordWrap ? '✓' : '' }}</span>
            <span>{{ t('titlebar.wordWrap') }}</span>
          </div>
          <div class="menu-item checkbox-item" @click.stop="toggleLineNumbers">
            <span class="checkbox-mark">{{ lineNumbers ? '✓' : '' }}</span>
            <span>{{ t('titlebar.lineNumbers') }}</span>
          </div>
          <div class="menu-item checkbox-item" @click.stop="toggleLogEditable">
            <span class="checkbox-mark">{{ logEditable ? '✓' : '' }}</span>
            <span>{{ t('titlebar.logEditable') }}</span>
          </div>
          <div class="menu-separator"></div>
          <div
            class="menu-item submenu-trigger"
            @mouseenter="handleFontSubmenuMouseEnter"
            @mouseleave="handleFontSubmenuMouseLeave"
          >
            <span class="checkbox-mark"></span>
            <span>{{ t('titlebar.font') }}</span>
            <div class="dropdown-submenu" v-if="showFontSubmenu"
              @mouseenter="showFontSubmenu = true"
              @mouseleave="showFontSubmenu = false"
            >
              <div
                class="menu-item"
                :class="{ 'font-item-active': font && currentFontFamily && font === currentFontFamily }"
                v-for="font in systemFonts"
                :key="font"
                @click="changeFont(font)"
                :style="{ fontFamily: font }"
              >
                <span v-if="font && currentFontFamily && font === currentFontFamily" class="font-check">✓</span>
                {{ formatFontName(font) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        class="menu-button"
        @mouseenter="((showFileMenu = false), (showEditMenu = false), (showToolsMenu = true), (showHelpMenu = false))"
      >
        <button class="menu-btn">{{ t('titlebar.tools') }}</button>
        <div
          class="dropdown-menu"
          v-if="showToolsMenu"
          @mouseenter="handleDropdownMouseEnter('tools')"
          @mouseleave="hideToolsMenu"
        >
          <div class="menu-item" @click="handleSettings">{{ t('sidebar.settings') }}</div>
          <div class="menu-item" @click="handleShortcuts">{{ t('sidebar.shortcuts') }}</div>
          <div class="menu-separator"></div>
          <div class="menu-item" @click="handleCheckUpdate">{{ t('sidebar.checkUpdate') }}</div>
          <div class="menu-item" @click="handlePlugins">{{ t('sidebar.plugins') }}</div>
        </div>
      </div>

      <div
        class="menu-button"
        @mouseenter="((showFileMenu = false), (showEditMenu = false), (showToolsMenu = false), (showHelpMenu = true))"
      >
        <button class="menu-btn">{{ t('titlebar.help') }}</button>
        <div
          class="dropdown-menu"
          v-if="showHelpMenu"
          @mouseenter="handleDropdownMouseEnter('help')"
          @mouseleave="hideHelpMenu"
        >
          <div class="menu-item" @click="handleDoc">{{ t('titlebar.doc') }}</div>
          <div class="menu-item" @click="handleAbout">{{ t('titlebar.about') }}</div>
          <div class="menu-item" @click="handleFeedBack">{{ t('titlebar.feedback') }}</div>
          <div class="menu-item" @click="handleDevelop">{{ t('titlebar.develop') }}</div>
        </div>
      </div>
    </div>

    <div class="titlebar-right">
      <button class="titlebar-btn" @click="minimizeWindow">
        <svg
          fill="white"
          width="20"
          height="20"
          viewBox="0 0 1024 900"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M256 469.333333m42.666667 0l426.666666 0q42.666667 0 42.666667 42.666667l0 0q0 42.666667-42.666667 42.666667l-426.666666 0q-42.666667 0-42.666667-42.666667l0 0q0-42.666667 42.666667-42.666667Z"
            p-id="10596"
          ></path>
        </svg>
      </button>
      <button class="titlebar-btn" @click="maximizeWindow">
        <svg
          v-if="isMaximized"
          fill="white"
          width="12"
          height="12"
          viewBox="0 0 1024 900"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M646.4 938.667H224C147.2 938.667 85.333 876.8 85.333 800V377.6c0-76.8 61.867-138.667 138.667-138.667h422.4c76.8 0 138.667 61.867 138.667 138.667V800c0 76.8-61.867 138.667-138.667 138.667zM224 302.933c-40.533 0-74.667 34.134-74.667 74.667V800c0 40.533 34.134 74.667 74.667 74.667h422.4c40.533 0 74.667-34.134 74.667-74.667V377.6c0-40.533-34.134-74.667-74.667-74.667H224z"
            p-id="1614"
          ></path>
          <path
            d="M793.6 785.067c-17.067 0-32-14.934-32-32s14.933-32 32-32c44.8 0 81.067-36.267 81.067-81.067V224c0-42.667-32-74.667-74.667-74.667H386.133c-44.8 0-81.066 36.267-81.066 81.067 0 17.067-14.934 32-32 32s-32-14.933-32-32c-2.134-81.067 64-145.067 145.066-145.067h416C878.933 85.333 940.8 147.2 940.8 224v416c-2.133 78.933-66.133 145.067-147.2 145.067z"
            p-id="1615"
          ></path>
        </svg>
        <svg
          v-else
          viewBox="0 0 1024 1024"
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          fill="white"
        >
          <path
            d="M770.9 923.3H253.1c-83.8 0-151.9-68.2-151.9-151.9V253.6c0-83.8 68.2-151.9 151.9-151.9h517.8c83.8 0 151.9 68.2 151.9 151.9v517.8c0 83.8-68.1 151.9-151.9 151.9zM253.1 181.7c-39.7 0-71.9 32.3-71.9 71.9v517.8c0 39.7 32.3 71.9 71.9 71.9h517.8c39.7 0 71.9-32.3 71.9-71.9V253.6c0-39.7-32.3-71.9-71.9-71.9H253.1z"
            p-id="4422"
          ></path>
        </svg>
      </button>
      <button class="titlebar-btn close-btn" @click="closeWindow">
        <svg
          fill="white"
          viewBox="0 0 1024 1024"
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
        >
          <path
            d="M512 451.669333l165.973333-165.973333a21.333333 21.333333 0 0 1 30.122667 0l30.165333 30.208a21.333333 21.333333 0 0 1 0 30.165333L572.330667 512l165.973333 165.973333a21.333333 21.333333 0 0 1 0 30.122667l-30.208 30.165333a21.333333 21.333333 0 0 1-30.165333 0L512 572.330667l-165.973333 165.973333a21.333333 21.333333 0 0 1-30.122667 0l-30.165333-30.208a21.333333 21.333333 0 0 1 0-30.165333L451.669333 512l-165.973333-165.973333a21.333333 21.333333 0 0 1 0-30.122667l30.208-30.165333a21.333333 21.333333 0 0 1 30.165333 0L512 451.669333z"
            p-id="7103"
          ></path>
        </svg>
      </button>
    </div>
  </div>
  <ExportDialog ref="exportDialogRef" @notifyExport="(payload) => emit('notifyImport', payload)" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { getSystemFonts, formatFontName } from '../utils/FontDetector'
import ExportDialog from './ExportDialog.vue'

const { t } = useI18n()

const isMaximized = ref(false)
const showFileMenu = ref(false)
const showEditMenu = ref(false)
const showToolsMenu = ref(false)
const showHelpMenu = ref(false)
// 字体子菜单状态
const showFontSubmenu = ref(false)
const fontsLoaded = ref(false)
const systemFonts = ref<string[]>([])
const currentFontFamily = ref('Fira Code') // 当前活动的字体
const emit = defineEmits([
  'toggle-connection-list',
  'refreshCommands',
  'refreshConnections',
  'notifyImport',
  'change-font',
  'change-font-size',
  'open-about',
  'open-settings',
  'open-shortcuts',
  'check-update',
  'open-plugins',
  'toggle-word-wrap',
  'toggle-line-numbers',
  'toggle-log-editable'
])
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const props = defineProps({
  showConnectionList: {
    type: Boolean,
    default: true
  },
  currentFont: {
    type: String,
    default: 'Fira Code'
  },
  wordWrap: {
    type: Boolean,
    default: false
  },
  lineNumbers: {
    type: Boolean,
    default: true
  },
  logEditable: {
    type: Boolean,
    default: false
  }
})

const handleWindowMaximized = () => (isMaximized.value = true)
const handleWindowUnmaximized = () => (isMaximized.value = false)
const minimizeWindow = () => window.windowApi.minimizeWindow()
const maximizeWindow = () => window.windowApi.maximizeWindow()
const closeWindow = () => window.windowApi.closeWindow()
const toggleConnectionList = () => emit('toggle-connection-list')

const hideFileMenu = () => {
  setTimeout(() => {
    showFileMenu.value = false
  }, 200)
}

const hideHelpMenu = () => {
  setTimeout(() => {
    showHelpMenu.value = false
  }, 200)
}

const hideToolsMenu = () => {
  setTimeout(() => {
    showToolsMenu.value = false
  }, 200)
}

const importData = async () => {
  showFileMenu.value = false
  try {
    const result = await window.dialogApi.openFileDialog({
      title: t('titlebar.importData'),
      filters: [
        { name: 'ZIP 文件', extensions: ['zip'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })

    if (result.filePaths && result.filePaths.length > 0) {
      const importResult = await window.storageApi.importData(result.filePaths[0])
      if (importResult.success) {
        // 构建统计消息
        const parts: string[] = []
        if (importResult.settingsImported) parts.push(t('importDialog.settingsImported'))
        if (importResult.comPortsImported) parts.push(t('importDialog.comPortsImported'))
        if (importResult.groupsImported !== undefined) {
          parts.push(t('importDialog.groupsImported', { added: importResult.groupsImported, skipped: importResult.groupsSkipped }))
        }
        if (importResult.commandsImported !== undefined) {
          parts.push(t('importDialog.commandsImported', { added: importResult.commandsImported, skipped: importResult.commandsSkipped }))
        }
        if (importResult.connectionsImported !== undefined) {
          parts.push(t('importDialog.connectionsImported', { added: importResult.connectionsImported, skipped: importResult.connectionsSkipped }))
        }
        const message = parts.length > 0 ? parts.join(' | ') : t('importDialog.importSuccess')
        emit('notifyImport', { success: true, title: t('importDialog.importSuccessTitle'), message })
        emit('refreshCommands')
        emit('refreshConnections')
      } else {
        const errMsg = importResult.message === 'INVALID_FORMAT'
          ? t('importDialog.invalidFormat')
          : importResult.message
        emit('notifyImport', { success: false, title: t('notification.importFailed'), message: errMsg })
      }
    }
  } catch (error) {
    console.error(t('notification.importFailed'), error)
    emit('notifyImport', { success: false, title: t('notification.importFailed'), message: String(error) })
  }
}

// 导出数据（打开勾选对话框）
const exportDialogRef = ref<InstanceType<typeof ExportDialog> | null>(null)
const exportData = () => {
  showFileMenu.value = false
  exportDialogRef.value?.open()
}

// 从 SuperCom 导入
const importFromSuperCom = async () => {
  showFileMenu.value = false
  try {
    const result = await window.dialogApi.openFileDialog({
      title: t('titlebar.importFromSuperCom'),
      filters: [
        { name: 'SuperCom 配置文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })

    if (result.filePaths && result.filePaths.length > 0) {
      const importResult = await window.storageApi.importFromSuperCom(result.filePaths[0])
      if (importResult.success) {
        // 构建消息：命令导入 + 语法高亮导入
        const parts: string[] = []
        if (importResult.imported > 0 || importResult.skipped > 0) {
          parts.push(
            t('notification.importFromSuperComSuccess', { imported: importResult.imported, skipped: importResult.skipped, groups: importResult.groups })
          )
        }
        if (importResult.syntaxImported !== undefined) {
          parts.push(
            `语法高亮: ${importResult.syntaxImported} 个规则组` + (importResult.syntaxSkipped > 0 ? `, ${importResult.syntaxSkipped} 跳过` : '')
          )
        }
        emit('notifyImport', { success: true, title: t('notification.importFromSuperComSuccessTitle'), message: parts.join(' | ') })
        emit('refreshCommands')
        // 通知语法高亮页面刷新
        window.dispatchEvent(new CustomEvent('syntax-rules-updated'))
      } else {
        emit('notifyImport', { success: false, title: t('notification.importFromSuperComFailed'), message: importResult.message })
      }
    }
  } catch (error) {
    console.error(t('notification.importFromSuperComFailed'), error)
    emit('notifyImport', { success: false, title: t('notification.importFromSuperComFailed'), message: String(error) })
  }
}

const openAppDir = async () => {
  showFileMenu.value = false
  await window.toolApi.openAppDir()
}

const openUserDataDir = async () => {
  showFileMenu.value = false
  await window.toolApi.openUserDataDir()
}

const handleExit = async () => {
  showFileMenu.value = false
  try {
    await ElMessageBox.confirm(
      t('titlebar.exitConfirm'),
      t('titlebar.exit'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
        center: true
      }
    )
    window.windowApi.closeWindow()
  } catch {
    // 用户取消，不做任何操作
  }
}

const handleAbout = () => {
  showHelpMenu.value = false
  emit('open-about')
}

const handleDevelop = () => {
  showHelpMenu.value = false
}

const handleFeedBack = () => {
  window.toolApi.openExternalUrl('https://github.com/SuperStudio/SuperConnectX/issues')
  showHelpMenu.value = false
}

const handleDoc = () => {
  showHelpMenu.value = false
}

const handleSettings = () => {
  showToolsMenu.value = false
  emit('open-settings')
}

const handleShortcuts = () => {
  showToolsMenu.value = false
  emit('open-shortcuts')
}

const handleCheckUpdate = () => {
  showToolsMenu.value = false
  emit('check-update')
}

const handlePlugins = () => {
  showToolsMenu.value = false
  emit('open-plugins')
}

const handleMenuMouseEnter = async (menuType) => {
  if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null }
  showFileMenu.value = false
  showEditMenu.value = false
  showToolsMenu.value = false
  showHelpMenu.value = false
  showFontSubmenu.value = false

  if (!fontsLoaded.value) {
    systemFonts.value = await getSystemFonts()
    fontsLoaded.value = true
  }

  if (menuType === 'file') showFileMenu.value = true
  if (menuType === 'edit') showEditMenu.value = true
  if (menuType === 'tools') showToolsMenu.value = true
  if (menuType === 'help') showHelpMenu.value = true
}

let leaveTimer: ReturnType<typeof setTimeout> | null = null

const handleMenuMouseLeave = (menuType) => {
  leaveTimer = setTimeout(() => {
    if (menuType === 'file' && !showFontSubmenu.value) showFileMenu.value = false
    if (menuType === 'edit' && !showFontSubmenu.value) showEditMenu.value = false
    if (menuType === 'tools' && !showFontSubmenu.value) showToolsMenu.value = false
    if (menuType === 'help' && !showFontSubmenu.value) showHelpMenu.value = false
  }, 200)
}

const handleFontSubmenuMouseEnter = (e: MouseEvent) => {
  showFontSubmenu.value = true
  // 滚动到当前选中的字体
  nextTick(() => {
    const submenu = (e.currentTarget as HTMLElement)?.querySelector('.dropdown-submenu') as HTMLElement | null
    if (!submenu) return
    const activeItem = submenu.querySelector('.font-item-active') as HTMLElement | null
    if (activeItem) {
      submenu.scrollTop = activeItem.offsetTop - submenu.clientHeight / 2 + activeItem.clientHeight / 2
    }
  })
}

const handleFontSubmenuMouseLeave = () => {
  setTimeout(() => {
    showFontSubmenu.value = false
  }, 200)
}

/** 鼠标进入下拉菜单时取消 leaveTimer 并保持菜单打开 */
const handleDropdownMouseEnter = (menu: 'file' | 'edit' | 'tools' | 'help') => {
  if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null }
  showFileMenu.value = menu === 'file'
  showEditMenu.value = menu === 'edit'
  showToolsMenu.value = menu === 'tools'
  showHelpMenu.value = menu === 'help'
}

/** 鼠标离开下拉菜单时延迟关闭 */
const handleDropdownMouseLeave = (menu: 'file' | 'edit' | 'tools' | 'help') => {
  leaveTimer = setTimeout(() => {
    if (menu === 'file' && !showFontSubmenu.value) showFileMenu.value = false
    if (menu === 'edit' && !showFontSubmenu.value) showEditMenu.value = false
    if (menu === 'tools' && !showFontSubmenu.value) showToolsMenu.value = false
    if (menu === 'help' && !showFontSubmenu.value) showHelpMenu.value = false
  }, 200)
}

const toggleWordWrap = () => {
  emit('toggle-word-wrap')
}

const toggleLineNumbers = () => {
  emit('toggle-line-numbers')
}

const toggleLogEditable = () => {
  emit('toggle-log-editable')
}

const changeFont = (fontFamily) => {
  showFontSubmenu.value = false
  showEditMenu.value = false
  emit('change-font', fontFamily)
}

// 监听外部传入的 currentFont 变化
watch(() => props.currentFont, (newFont) => {
  if (newFont) {
    currentFontFamily.value = newFont
  }
}, { immediate: true })

onMounted(async () => {
  window.windowApi.getWindowState().then((state) => (isMaximized.value = state))
  window.addEventListener('window-maximized', handleWindowMaximized)
  window.addEventListener('window-unmaximized', handleWindowUnmaximized)
  // 点击其他地方关闭菜单
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  window.removeEventListener('window-maximized', handleWindowMaximized)
  window.removeEventListener('window-unmaximized', handleWindowUnmaximized)
  document.removeEventListener('click', handleClickOutside)
})

// 点击菜单外部关闭所有菜单
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  // 如果点击的不是菜单按钮也不是下拉菜单，则关闭所有菜单
  if (!target.closest('.menu-button') && !target.closest('.dropdown-menu')) {
    showFileMenu.value = false
    showEditMenu.value = false
    showToolsMenu.value = false
    showHelpMenu.value = false
    showFontSubmenu.value = false
  }
}
</script>

<style scoped>
.custom-titlebar {
  height: 30px;
  background-color: var(--bg-titlebar);
  color: var(--text-titlebar);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 0px;
  -webkit-app-region: drag;
  border-bottom: 1px solid var(--border-primary);
  user-select: none;
}

.titlebar-left {
  margin-left: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.app-logo {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;

  overflow: hidden;

  margin: 0;
  padding: 0;
  margin-left: -5px;
}

.logo-img {
  width: 90%;
  height: 90%;
  object-fit: contain;

  display: block;
  transition: opacity 0.2s ease;
}

.app-title {
  font-size: 12px;
  font-weight: 500;
}

.titlebar-right {
  display: flex;
  -webkit-app-region: no-drag;
}

.titlebar-btn {
  width: 40px;
  height: 30px;
  background: none;
  border: none;
  color: var(--text-white);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0px;
  transition: background-color 0.2s;
}

.titlebar-btn:hover:not(.close-btn) {
  background-color: var(--overlay-hover);
}

.close-btn:hover {
  background-color: var(--btn-close-hover);
}

.min-btn {
  font-size: 10px;
}

.titlebar-btn:focus {
  outline: none;
}

.svg-box {
  width: 30px;
  height: 30px;
}
.toggle-connection-btn {
  -webkit-app-region: no-drag;
  margin-left: -10px;
  border: none;
  background: transparent;
  cursor: pointer;

  transition: background-color 0.2s ease;
}

.toggle-connection-btn:hover {
  background-color: var(--overlay-hover);
}

.toggle-connection-btn:active {
  background-color: var(--overlay-active);
}

.toggle-connection-btn.toggled svg {
  transform: rotate(90deg);
}

.titlebar-menu {
  margin-left: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-button {
  position: relative;
  -webkit-app-region: no-drag;
  margin: 0 4px;
}

.menu-btn {
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--text-titlebar);
  padding: 0 12px;
  height: 22px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.menu-btn:hover {
  background-color: var(--overlay-hover);
}

/* 下拉菜单 - 使用全局统一样式 */
.dropdown-menu {
  position: absolute;
  top: 26px;
  left: 0;
  width: 160px;
  z-index: 10000;
}

.menu-item {
  color: var(--menu-item-color);
  padding: 6px 16px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.menu-item:hover {
  background-color: var(--menu-item-hover-bg);
  color: var(--menu-item-hover-color);
}

.menu-separator {
  height: 1px;
  background-color: var(--menu-divider-color);
  margin: 4px 0;
}

.font-check {
  color: var(--btn-icon-text);
  font-weight: bold;
  width: 16px;
}

/* 复选框菜单项 */
.checkbox-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.checkbox-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 11px;
  color: var(--btn-icon-text);
  font-weight: bold;
  flex-shrink: 0;
}

/* 当前选中字体项高亮 */
.font-item-active {
  background-color: var(--accent-blue-subtle) !important;
  color: var(--btn-icon-text) !important;
  font-weight: 600;
}

/* 子菜单触发器 */
.submenu-trigger {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 子菜单触发器箭头 */
.submenu-trigger::after {
  content: '▶';
  position: absolute;
  right: 8px;
  top: 50%;
  font-size: 10px;
  transform: translateY(-50%) scaleX(0.7);
}

/* 子菜单样式 - 继承 dropdown-menu 基础样式 */
.dropdown-submenu {
  background-color: var(--menu-bg-color);
  border: 1px solid var(--menu-border-color);
  border-radius: var(--menu-border-radius);
  box-shadow: var(--menu-box-shadow);
  position: absolute;
  top: 0;
  left: 100%;
  min-width: 150px;
  max-height: 600px;
  overflow-y: auto;
  z-index: 10001;
  padding: 4px 0;
}

/* 美化字体列表滚动条 */
.dropdown-submenu::-webkit-scrollbar {
  width: 6px;
}

.dropdown-submenu::-webkit-scrollbar-track {
  background: var(--font-submenu-scrollbar-track);
  border-radius: 3px;
}

.dropdown-submenu::-webkit-scrollbar-thumb {
  background: var(--font-submenu-scrollbar-thumb);
  border-radius: 3px;
  transition: background 0.2s;
}

.dropdown-submenu::-webkit-scrollbar-thumb:hover {
  background: var(--font-submenu-scrollbar-thumb-hover);
}

.dropdown-submenu::-webkit-scrollbar-corner {
  background: transparent;
}
</style>
