// electron.vite.config.ts
// 注意：所有路径以本文件所在目录（apps/superconnectx/）为锚，与执行 cwd 无关，
// 根目录通过 `electron-vite dev --config apps/superconnectx/electron.vite.config.ts` 驱动本应用。
import { resolve } from 'path'
import { readFileSync } from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const here = resolve(__dirname)
// workspace 包源码根（相对 app 为 ../..）
const repoRoot = resolve(here, '../..')

// 读取根 package.json，将 contributors 在编译期内联进 renderer bundle（与应用一起打包，不依赖运行时文件）
const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf-8')) as {
  contributors?: Array<{ name: string; url: string; role?: string }>
  app_config?: {
    RepositoryUrl?: string
    IssuesUrl?: string
    WikiUrl?: string
    JoinGroupUrl?: string
  }
}

// 将 app_config 中的外部链接在编译期内联进 bundle，避免代码里散落硬编码 URL
// 构建时间同样内联：关于页展示「发布时间」，打包即成版，取构建时刻即可
const buildDate = new Date().toISOString()

const appDefines = {
  __APP_CONTRIBUTORS__: JSON.stringify(rootPkg.contributors ?? []),
  __APP_REPOSITORY_URL__: JSON.stringify(rootPkg.app_config?.RepositoryUrl ?? ''),
  __APP_ISSUES_URL__: JSON.stringify(rootPkg.app_config?.IssuesUrl ?? ''),
  __APP_WIKI_URL__: JSON.stringify(rootPkg.app_config?.WikiUrl ?? ''),
  __APP_JOIN_GROUP_URL__: JSON.stringify(rootPkg.app_config?.JoinGroupUrl ?? ''),
  __APP_BUILD_DATE__: JSON.stringify(buildDate)
}

export default defineConfig({
  main: {
    define: appDefines,
    resolve: {
      alias: {
        '@superx/foundation': resolve(repoRoot, 'packages/foundation/src'),
        '@superx/mcp': resolve(repoRoot, 'packages/superconnectx-mcp/src')
      }
    },
    plugins: [externalizeDepsPlugin({ exclude: ['@superx/mcp'] })],
    build: {
      outDir: resolve(here, 'out/main'), // 明确主进程输出到 out/main
      rollupOptions: {
        input: {
          index: resolve(here, 'src/main/index.ts'),
          // Worker 线程入口，作为独立 chunk 打包，供 Worker Pool 动态加载
          'workers/ConnectionWorker': resolve(here, 'src/main/workers/ConnectionWorker.ts')
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
    root: resolve(here, 'src/preload'),
    build: {
      outDir: resolve(here, 'out/preload'), // 明确预加载脚本输出到 out/preload
      rollupOptions: {
        input: {
          index: resolve(here, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(here, 'src/renderer'),
    define: appDefines,
    resolve: {
      alias: {
        '@renderer': resolve(here, 'src/renderer/src'),
        // workspace 包直接指向源码（免编译、改即生效）
        '@superx/shared': resolve(repoRoot, 'packages/shared/src'),
        '@superx/foundation': resolve(repoRoot, 'packages/foundation/src')
      }
    },
    plugins: [vue()],
    base: './', // 关键：Vue 静态资源相对路径
    build: {
      outDir: resolve(here, 'out/renderer'), // 明确渲染进程输出到 out/renderer
      minify: 'esbuild',
      rollupOptions: {
        input: resolve(here, 'src/renderer/index.html'), // 显式 html 入口，摆脱 cwd 依赖
        output: {
          manualChunks: {
            'monaco-editor': ['monaco-editor']
          }
        }
      }
    }
  }
})
