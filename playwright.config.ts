import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'path'

/**
 * Playwright E2E 配置
 *
 * 本项目是 Electron 应用，通过 @playwright/test 的 _electron.launch()
 * 启动真实应用（out/main/index.js）进行端到端测试。
 *
 * 前置条件：
 *   先执行 `npm run build`（或至少 `electron-vite build`）生成 out/ 产物，
 *   因为 E2E 启动的是打包后的主进程入口。
 *
 * 数据隔离：
 *   通过 SCX_USER_DATA_DIR 环境变量让应用把 userData 写到独立临时目录，
 *   避免污染开发者本地真实数据（配合 src/main/utils/AppDir.ts 支持）。
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Electron 单实例，串行执行避免窗口/数据冲突
  workers: 1,
  fullyParallel: false,
  // Electron 启动较慢，超时放宽
  timeout: 120000,
  expect: {
    timeout: 15000
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/report/e2e-html', open: 'never' }],
    ['json', { outputFile: 'tests/report/e2e-results.json' }]
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  outputDir: 'tests/report/e2e-artifacts',
  projects: [
    {
      name: 'electron',
      testMatch: /.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome']
      }
    }
  ]
})
