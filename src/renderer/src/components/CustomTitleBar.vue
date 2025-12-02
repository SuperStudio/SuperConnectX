<template>
  <div class="custom-titlebar">
    <div class="titlebar-left">
      <div class="app-logo">🚀</div>
      <div class="app-title">SuperConnectX</div>
    </div>

    <div class="titlebar-right">
      <button class="titlebar-btn" @click="minimizeWindow">—</button>
      <button class="titlebar-btn" @click="maximizeWindow">{{ isMaximized ? '❐' : '□' }}</button>
      <button class="titlebar-btn close-btn" @click="closeWindow">✕</button>
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
</script>

<style scoped>
.custom-titlebar {
  height: 32px;
  background-color: #2d2d2d;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 10px;
  -webkit-app-region: drag; /* 允许拖拽 */
  border-bottom: 1px solid #333;
  user-select: none; /* 禁止文本选中 */
}

.titlebar-left {
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
  gap: 4px;
  -webkit-app-region: no-drag; /* 取消拖拽，允许按钮点击 */
}

.titlebar-btn {
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  color: white;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.titlebar-btn:hover:not(.close-btn) {
  background-color: rgba(255, 255, 255, 0.1);
}

.close-btn:hover {
  background-color: #ff4d4f;
}

/* 防止按钮聚焦样式 */
.titlebar-btn:focus {
  outline: none;
}
</style>
