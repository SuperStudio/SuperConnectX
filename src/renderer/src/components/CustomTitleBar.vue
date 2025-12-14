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

      <div class="menu-button" @mouseenter="showFileMenu = true" @mouseleave="hideFileMenu">
        <button class="menu-btn">文件</button>
        <div
          class="dropdown-menu"
          v-if="showFileMenu"
          @mouseenter="showFileMenu = true"
          @mouseleave="hideFileMenu"
        >
          <div class="menu-item" @click="handleNewWindow">新建窗口</div>
          <div class="menu-item" @click="handleImport">导入连接</div>
          <div class="menu-item" @click="handleExport">导出连接</div>
          <div class="menu-separator"></div>
          <div class="menu-item" @click="handleExit">退出</div>
        </div>
      </div>

      <div class="menu-button" @mouseenter="showEditMenu = true" @mouseleave="hideEditMenu">
        <button class="menu-btn">编辑</button>
        <div
          class="dropdown-menu"
          v-if="showEditMenu"
          @mouseenter="showEditMenu = true"
          @mouseleave="hideEditMenu"
        >
          <div class="menu-item" @click="handleUndo">撤销</div>
          <div class="menu-item" @click="handleUndo">重做</div>
          <div class="menu-separator"></div>
          <div class="menu-item" @click="handleUndo">剪切</div>
          <div class="menu-item" @click="handleUndo">复制</div>
          <div class="menu-item" @click="handleUndo">粘贴</div>
        </div>
      </div>

      <div class="menu-button" @mouseenter="showHelpMenu = true" @mouseleave="hideHelpMenu">
        <button class="menu-btn">帮助</button>
        <div
          class="dropdown-menu"
          v-if="showHelpMenu"
          @mouseenter="showHelpMenu = true"
          @mouseleave="hideHelpMenu"
        >
          <div class="menu-item" @click="handleDoc">文档</div>
          <div class="menu-item" @click="handleAbout">关于</div>
          <div class="menu-item" @click="handleFeedBack">反馈问题</div>
          <div class="menu-item" @click="handleDevelop">参与开发</div>
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
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { defineEmits, defineProps } from 'vue'

const isMaximized = ref(false)
const showFileMenu = ref(false)
const showEditMenu = ref(false)
const showHelpMenu = ref(false)
const emit = defineEmits(['toggle-connection-list'])
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const props = defineProps({
  showConnectionList: {
    type: Boolean,
    default: true
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
  }, 50)
}

const hideEditMenu = () => {
  setTimeout(() => {
    showEditMenu.value = false
  }, 50)
}

const hideHelpMenu = () => {
  setTimeout(() => {
    showHelpMenu.value = false
  }, 50)
}

const handleNewWindow = () => {
  showFileMenu.value = false
}

const handleImport = () => {
  showFileMenu.value = false
}

const handleExport = () => {
  showFileMenu.value = false
}

const handleExit = () => {
  window.windowApi.closeWindow()
}

const handleUndo = () => {
  showEditMenu.value = false
}

const handleAbout = () => {
  showHelpMenu.value = false
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

onMounted(() => {
  window.windowApi.getWindowState().then((state) => (isMaximized.value = state))
  window.addEventListener('window-maximized', handleWindowMaximized)
  window.addEventListener('window-unmaximized', handleWindowUnmaximized)
})

onUnmounted(() => {
  window.removeEventListener('window-maximized', handleWindowMaximized)
  window.removeEventListener('window-unmaximized', handleWindowUnmaximized)
})
</script>

<style scoped>
.custom-titlebar {
  height: 30px;
  background-color: #323233;
  color: #c5c5c5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 0px;
  -webkit-app-region: drag;
  border-bottom: 1px solid #333;
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
  width: 100%;
  height: 100%;
  object-fit: contain;

  display: block;
  transition: opacity 0.2s ease;
}

.app-title {
  font-size: 14px;
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
  color: white;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0px;
  transition: background-color 0.2s;
}

.titlebar-btn:hover:not(.close-btn) {
  background-color: rgba(255, 255, 255, 0.1);
}

.close-btn:hover {
  background-color: #ff4d4f;
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
  background-color: rgba(255, 255, 255, 0.1);
}

.toggle-connection-btn:active {
  background-color: rgba(255, 255, 255, 0.2);
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
}

.menu-btn {
  background: none;
  border: none;
  color: #c5c5c5;
  padding: 0 12px;
  height: 30px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.menu-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.dropdown-menu {
  position: absolute;
  top: 30px;
  left: 0;
  width: 160px;
  background-color: #2d2d2d;
  border: 1px solid #444;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
  z-index: 1000;
  padding: 4px 0;
}

.menu-item {
  padding: 6px 16px;
  color: #e0e0e0;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.menu-item:hover {
  background-color: #3a3a3a;
}

.menu-separator {
  height: 1px;
  background-color: #444;
  margin: 4px 0;
}
</style>
