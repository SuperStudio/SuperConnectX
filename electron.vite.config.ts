// electron.vite.config.ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve('out/main'), // 明确主进程输出到 out/main
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          // Worker 线程入口，作为独立 chunk 打包，供 Worker Pool 动态加载
          'workers/ConnectionWorker': resolve('src/main/workers/ConnectionWorker.ts')
        },
        output: {
          // 保持目录结构，确保 Worker 路径与源码一致
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js'
        }
      }
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
      outDir: resolve('out/renderer'), // 明确渲染进程输出到 out/renderer
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: {
            // 终端和语法预览只使用编辑器核心，避免把 TS/HTML/CSS 等语言 Worker 全部带入。
            'monaco-editor': ['monaco-editor/esm/vs/editor/editor.api.js']
          }
        }
      }
    }
  }
})
