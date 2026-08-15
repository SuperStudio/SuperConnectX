import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const commonAlias = {
  '@': resolve('src'),
  electron: resolve('tests/__mocks__/electron.ts'),
  'electron-store': resolve('tests/__mocks__/electron-store.ts'),
  '../ipc/IpcAppLogger': resolve('tests/__mocks__/IpcAppLogger.ts'),
  serialport: resolve('tests/__mocks__/serialport.ts')
}

export default defineConfig({
  test: {
    // 只跑集成测试
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    // 集成测试可能需要更长超时（网络、串口等）
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'tests/coverage/integration',
      // all: false 仅统计被测文件（import 到且命中 include），避免 v8 全局扫描稀释覆盖率
      all: false,
      include: [
        'src/main/protocol/ComClient.ts',
        'src/main/protocol/TelnetClient.ts',
        'src/main/protocol/FtpClient.ts',
        'src/main/protocol/BaseClient.ts',
        'src/main/protocol/ConnectionInfo.ts'
      ],
      exclude: ['out/**', 'node_modules/**', 'tests/**', '**/*.test.ts', '**/__mocks__/**']
      // 注意：集成测试聚焦协议真实交互（需真实硬件/网络），覆盖率天然偏低，
      // 故不设 thresholds，避免误伤；覆盖率仅作观察用途。
    },
    reporters: ['default', 'json', 'junit'],
    outputFile: {
      json: 'tests/report/integration-results.json',
      junit: 'tests/report/integration-junit.xml'
    }
  },
  resolve: {
    alias: commonAlias
  }
})
