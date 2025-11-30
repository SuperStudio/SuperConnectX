// electron.vite.config.ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve('out/main') // 明确主进程输出到 out/main
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve('out/preload') // 明确预加载脚本输出到 out/preload,
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue()],
    base: './', // 关键：Vue 静态资源相对路径
    build: {
      outDir: resolve('out/renderer') // 明确渲染进程输出到 out/renderer
    }
  }
})
