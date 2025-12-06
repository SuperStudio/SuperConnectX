<template>
  <div class="custom-titlebar">
    <div class="titlebar-left">
      <!-- 添加切换按钮 -->
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
      <div class="app-logo">🚀</div>
      <div class="app-title">SuperConnectX</div>
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

// 从window对象获取preload暴露的API（关键修改）
const electronStore = window.electronStore

const isMaximized = ref(false)

// 窗口状态变化处理函数
const handleWindowMaximized = () => {
  isMaximized.value = true
}

const handleWindowUnmaximized = () => {
  isMaximized.value = false
}

onMounted(() => {
  // 初始化窗口状态（通过preload暴露的API）
  electronStore.getWindowState().then((state) => {
    isMaximized.value = state
  })

  // 监听窗口状态变化事件
  window.addEventListener('window-maximized', handleWindowMaximized)
  window.addEventListener('window-unmaximized', handleWindowUnmaximized)
})

onUnmounted(() => {
  // 移除事件监听，防止内存泄漏
  window.removeEventListener('window-maximized', handleWindowMaximized)
  window.removeEventListener('window-unmaximized', handleWindowUnmaximized)
})

// 最小化窗口
const minimizeWindow = () => {
  electronStore.minimizeWindow()
}

// 最大化/还原窗口
const maximizeWindow = () => {
  electronStore.maximizeWindow()
}

// 关闭窗口
const closeWindow = () => {
  electronStore.closeWindow()
}

import { defineEmits, defineProps } from 'vue'

// 接收父组件的显示状态
const props = defineProps({
  showConnectionList: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['toggle-connection-list'])

const toggleConnectionList = () => {
  emit('toggle-connection-list')
}
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
  -webkit-app-region: drag; /* 允许拖拽 */
  border-bottom: 1px solid #333;
  user-select: none; /* 禁止文本选中 */
}

.titlebar-left {
  margin-left: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.app-logo {
  font-size: 16px;
}

.app-title {
  font-size: 14px;
  font-weight: 500;
}

.titlebar-right {
  display: flex;
  -webkit-app-region: no-drag; /* 取消拖拽，允许按钮点击 */
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

/* 防止按钮聚焦样式 */
.titlebar-btn:focus {
  outline: none;
}

.svg-box {
  width: 30px; /* 可随意修改，图形比例不变 */
  height: 30px;
}
.toggle-connection-btn {
  -webkit-app-region: no-drag; /* 取消拖拽，允许按钮点击 */
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

/* 按钮图标切换样式 */
.toggle-connection-btn.toggled svg {
  transform: rotate(90deg);
}
</style>
