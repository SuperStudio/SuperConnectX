import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser
      }
    }
  },
  {
    files: ['**/*.{ts,mts,tsx,vue}'],
    rules: {
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/block-lang': [
        'error',
        {
          script: {
            lang: 'ts'
          }
        }
      ]
    }
  },
  {
    // 编译期内联常量（electron.vite.config.ts 的 define，类型声明见 renderer/src/env.d.ts）
    files: ['apps/*/src/renderer/**/*.{ts,tsx,vue}'],
    ignores: ['**/*.d.ts'],
    languageOptions: {
      globals: {
        __APP_CONTRIBUTORS__: 'readonly',
        __APP_JOIN_GROUP_URL__: 'readonly',
        __APP_REPOSITORY_URL__: 'readonly',
        __APP_ISSUES_URL__: 'readonly',
        __APP_WIKI_URL__: 'readonly',
        __APP_BUILD_DATE__: 'readonly'
      }
    }
  },
  {
    // 进程边界：渲染层（应用渲染层 + foundation 渲染子树）禁止引用主进程运行时
    files: [
      'apps/*/src/renderer/**/*.{ts,tsx,vue}',
      'packages/foundation/src/shell/**/*.ts',
      'packages/foundation/src/workbench/**/*.ts',
      'packages/foundation/src/settings/**/*.ts',
      'packages/foundation/src/theme/**/*.ts'
    ],
    ignores: ['**/*.d.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@superx/foundation/main', '@superx/foundation/main/**', '**/foundation/src/main/**'],
              message: '主进程运行时（electron）不可被渲染层引用：@superx/foundation/main/* 仅供 apps/*/src/main 使用。'
            }
          ]
        }
      ]
    }
  },
  {
    // 进程边界：主进程 / preload 禁止引用 foundation 渲染层子树（Vue 组件与 composables）
    files: ['apps/*/src/main/**/*.ts', 'apps/*/src/preload/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@superx/foundation/shell',
                '@superx/foundation/shell/**',
                '@superx/foundation/workbench',
                '@superx/foundation/workbench/**',
                '@superx/foundation/settings',
                '@superx/foundation/settings/**',
                '@superx/foundation/theme',
                '@superx/foundation/theme/**'
              ],
              message: '渲染层子树（Vue）不可被主进程引用：主进程只能使用 @superx/foundation/main/*。'
            }
          ]
        }
      ]
    }
  },
  eslintConfigPrettier
)
