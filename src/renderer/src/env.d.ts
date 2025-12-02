// src/renderer/src/env.d.ts
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// 扩展window对象类型
declare global {
  interface Window {
    electronStore: {
      // 原有API...
      minimizeWindow: () => Promise<void>
      maximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
      getWindowState: () => Promise<boolean>
    }
    // 窗口状态事件
    addEventListener: (
      type: 'window-maximized' | 'window-unmaximized',
      listener: () => void
    ) => void
    removeEventListener: (
      type: 'window-maximized' | 'window-unmaximized',
      listener: () => void
    ) => void
  }
}
