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
          fill="currentColor"
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
          <div class="menu-item" @click="handleVirtualPort">{{ t('virtualPort.title') }}</div>
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
      <!-- 皮肤切换按钮 -->
      <div class="theme-switcher-wrapper" ref="themeSwitcherRef">
        <button class="titlebar-btn theme-btn" @click="toggleThemePanel" title="切换皮肤">
          <svg
            viewBox="0 0 1024 1024"
            width="16"
            height="16"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M328.147627 164.706987h67.403093c4.973227 2.94912 12.22656 4.068693 16.75264 7.5776 6.161067 4.734293 10.58816 10.738347 15.407787 16.892586 6.509227 8.2944 18.7904 16.3328 29.125973 20.657494 12.079787 4.98688 24.90368 7.8336 39.717547 10.581333 4.672853 0.303787 9.345707 0.508587 14.015146 0.812373 6.263467 0.965973 15.213227-0.559787 20.3776-1.62816 27.886933-5.597867 41.857707-10.175147 60.197547-24.726186 7.15776-5.748053 10.98752-15.213227 18.438827-20.70528 4.17792-2.286933 8.400213-4.67968 12.62592-7.021227 3.628373-1.42336 6.212267-0.610987 9.19552-2.440533h19.831466c19.135147 0 47.571627-2.594133 60.197547 4.017493 8.895147 4.78208 15.70816 12.311893 22.667947 19.07712 9.693867 9.41056 19.38432 18.824533 29.026986 28.235093 31.26272 30.47424 62.580053 60.89728 93.794987 91.37152 9.844053 10.530133 21.22752 19.636907 31.020373 30.221654 8.04864 8.495787 16.59904 14.854827 21.02272 27.163306 0.150187 1.98656 0.201387 3.969707 0.249174 5.956267 2.235733 13.431467-3.877547 23.197013-10.042027 30.982827-26.19392 25.38496-52.391253 50.82112-78.63296 76.158293-9.54368 10.635947-21.47328 25.439573-38.324907 28.53888-22.96832 4.225707-35.986773-9.919147-46.721706-20.34688-3.4816-3.457707-6.413653-7.8848-10.93632-10.379947-0.197973 0.2048-0.546133 0.4096-0.846507 0.5632v272.182614c-0.047787 25.53856-0.146773 51.17952-0.293547 76.71808-1.839787 8.8576-7.60832 18.01216-13.919573 22.84544-15.755947 11.905707-43.543893 9.25696-71.427413 9.25696H371.2c-19.43552 0-39.867733 1.47456-51.49696-6.048427-6.51264-4.072107-13.6704-11.70432-16.554667-19.28192-3.280213-8.751787-2.484907-20.964693-2.484906-32.6144v-51.38432-271.981227h-1.143467c-11.58144 10.175147-20.48 22.79424-36.037973 29.15328-13.21984 5.440853-28.678827-0.252587-36.928854-5.952853-5.76512-4.068693-10.141013-9.311573-15.110826-14.144853a23320.081067 23320.081067 0 0 0-35.488427-33.98656 1789.088427 1789.088427 0 0 1-16.800427-16.940374c-6.908587-5.799253-12.92288-12.417707-19.285333-18.722133-7.703893-7.529813-16.104107-13.380267-20.72576-23.965013-1.989973-4.478293-5.915307-12.56448-4.47488-20.094294 3.382613-17.855147 14.465707-27.26912 25.746773-37.290666 6.710613-5.901653 12.62592-12.76928 19.285334-18.71872l111.09376-108.21632c6.710613-6.509227 13.421227-13.021867 20.13184-19.585707 9.741653-9.458347 18.438827-21.162667 37.229226-21.77024-0.006827-0.3584-0.006827-0.662187-0.006826-1.017173z" fill="currentColor" p-id="7120"></path>
          </svg>
        </button>
        <!-- 皮肤选择悬浮面板 -->
        <Transition name="theme-fade">
          <div v-if="showThemePanel" class="theme-panel" @click.stop>
            <div class="theme-panel-title">{{ t('titlebar.theme') }}</div>
            <div class="theme-options">
              <div
                class="theme-option"
                :class="{ active: currentTheme === 'dark' }"
                @click="switchTheme('dark')"
              >
                <div class="theme-preview theme-preview-dark">
                  <div class="preview-bar"></div>
                  <div class="preview-content">
                    <div class="preview-sidebar"></div>
                    <div class="preview-main"></div>
                  </div>
                </div>
                <span class="theme-label">{{ t('titlebar.darkTheme') }}</span>
                <span v-if="currentTheme === 'dark'" class="theme-check">✓</span>
              </div>
              <div
                class="theme-option"
                :class="{ active: currentTheme === 'light' }"
                @click="switchTheme('light')"
              >
                <div class="theme-preview theme-preview-light">
                  <div class="preview-bar"></div>
                  <div class="preview-content">
                    <div class="preview-sidebar"></div>
                    <div class="preview-main"></div>
                  </div>
                </div>
                <span class="theme-label">{{ t('titlebar.lightTheme') }}</span>
                <span v-if="currentTheme === 'light'" class="theme-check">✓</span>
              </div>
            </div>
          </div>
        </Transition>
      </div>
      <button class="titlebar-btn" @click="minimizeWindow">
        <svg
          fill="currentColor"
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
          fill="currentColor"
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
          fill="currentColor"
        >
          <path
            d="M770.9 923.3H253.1c-83.8 0-151.9-68.2-151.9-151.9V253.6c0-83.8 68.2-151.9 151.9-151.9h517.8c83.8 0 151.9 68.2 151.9 151.9v517.8c0 83.8-68.1 151.9-151.9 151.9zM253.1 181.7c-39.7 0-71.9 32.3-71.9 71.9v517.8c0 39.7 32.3 71.9 71.9 71.9h517.8c39.7 0 71.9-32.3 71.9-71.9V253.6c0-39.7-32.3-71.9-71.9-71.9H253.1z"
            p-id="4422"
          ></path>
        </svg>
      </button>
      <button class="titlebar-btn close-btn" @click="closeWindow">
        <svg
          fill="currentColor"
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
import { getSystemFonts, formatFontName, getDefaultTerminalFont } from '../utils/FontDetector'
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
const currentFontFamily = ref(getDefaultTerminalFont()) // 当前活动的字体

// ---- 皮肤切换 ----
const showThemePanel = ref(false)
const currentTheme = ref(localStorage.getItem('app-theme') || 'dark')

const applyTheme = (theme: string) => {
  currentTheme.value = theme
  localStorage.setItem('app-theme', theme)
  document.documentElement.setAttribute('data-theme', theme)
}

const toggleThemePanel = () => {
  showThemePanel.value = !showThemePanel.value
}

const switchTheme = (theme: string) => {
  applyTheme(theme)
  showThemePanel.value = false
}
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
  'open-virtualPort',
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
    default: () => getDefaultTerminalFont()
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

const handleVirtualPort = () => {
  showToolsMenu.value = false
  emit('open-virtualPort')
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
  // 初始化主题
  const savedTheme = localStorage.getItem('app-theme') || 'dark'
  applyTheme(savedTheme)

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
  // 关闭皮肤面板
  if (showThemePanel.value && !target.closest('.theme-switcher-wrapper')) {
    showThemePanel.value = false
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

/* ---- 皮肤切换 ---- */
.theme-switcher-wrapper {
  position: relative;
  -webkit-app-region: no-drag;
}

.theme-btn {
  color: var(--text-titlebar);
}

.theme-btn:hover {
  color: var(--text-white);
}

.theme-panel {
  position: absolute;
  top: 30px;
  right: 0;
  width: 210px;
  background-color: var(--menu-bg-color);
  border: 1px solid var(--menu-border-color);
  border-radius: var(--menu-border-radius);
  box-shadow: var(--menu-box-shadow);
  padding: 12px;
  z-index: 10001;
}

.theme-panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--menu-item-color);
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--menu-divider-color);
}

.theme-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  position: relative;
}

.theme-option:hover {
  background-color: var(--menu-item-hover-bg);
}

.theme-option.active {
  background-color: var(--accent-blue-subtle);
}

.theme-preview {
  width: 40px;
  height: 28px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--menu-border-color);
  flex-shrink: 0;
}

.theme-preview-dark {
  background: #1e1e1e;
}

.theme-preview-dark .preview-bar {
  height: 6px;
  background: #323233;
}

.theme-preview-dark .preview-content {
  display: flex;
  height: 22px;
}

.theme-preview-dark .preview-sidebar {
  width: 10px;
  background: #252526;
  border-right: 1px solid #333;
}

.theme-preview-dark .preview-main {
  flex: 1;
  background: #1e1e1e;
}

.theme-preview-light {
  background: #f5f5f5;
}

.theme-preview-light .preview-bar {
  height: 6px;
  background: #e0e0e0;
}

.theme-preview-light .preview-content {
  display: flex;
  height: 22px;
}

.theme-preview-light .preview-sidebar {
  width: 10px;
  background: #ffffff;
  border-right: 1px solid #d0d0d0;
}

.theme-preview-light .preview-main {
  flex: 1;
  background: #f5f5f5;
}

.theme-label {
  font-size: 12px;
  color: var(--menu-item-color);
  flex: 1;
}

.theme-check {
  color: var(--btn-icon-text);
  font-size: 12px;
  font-weight: bold;
}

/* 面板过渡动画 */
.theme-fade-enter-active,
.theme-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.theme-fade-enter-from,
.theme-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
