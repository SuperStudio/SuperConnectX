import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    // @superx/shared 是 workspace 源码直出（TS），必须打包进产物而不是外置 require
    plugins: [externalizeDepsPlugin({ exclude: ['@superx/shared'] })],
    build: {
      outDir: resolve(__dirname, 'out/main'),
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@superx/shared'] })],
    build: {
      outDir: resolve(__dirname, 'out/preload'),
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@features': resolve(__dirname, 'src/renderer/src/features'),
        '@components': resolve(__dirname, 'src/renderer/src/components'),
        // workspace 包直连源码（与主应用 apps/superconnectx 同构：免编译、改即生效）
        '@superx/shared': resolve(__dirname, '../../packages/shared/src'),
        '@superx/foundation': resolve(__dirname, '../../packages/foundation/src')
      }
    },
    plugins: [vue()],
    build: {
      // 显式绝对路径（与主应用同构）：renderer 设置了 root 后，相对 outDir 会相对 root 解析导致产物写错位置
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    }
  }
})
