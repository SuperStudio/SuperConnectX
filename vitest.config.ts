import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const commonAlias = {
  '@': resolve('apps/superconnectx/src'),
  // workspace 包直接指向源码
  '@superx/shared': resolve('packages/shared/src'),
  '@superx/foundation': resolve('packages/foundation/src'),
  // 用 mock 替代 electron 模块
  electron: resolve('tests/__mocks__/electron.ts'),
  // 用 mock 替代 electron-store 模块
  'electron-store': resolve('tests/__mocks__/electron-store.ts'),
  // 用 mock 替代 logger (避免 import 链导致 fs 等问题)
  '../ipc/IpcAppLogger': resolve('tests/__mocks__/IpcAppLogger.ts'),
  // 用 mock 替代 serialport (避免原生模块依赖)
  serialport: resolve('tests/__mocks__/serialport.ts')
}

const commonCoverage = {
  provider: 'v8' as const,
  reporter: ['text', 'html', 'json-summary'],
  // all: false 仅统计被测文件（import 到且命中 include），避免 v8 全局扫描稀释覆盖率
  all: false,
  include: [
    'apps/superconnectx/src/main/utils/DataCheckEngine.ts',
    'apps/superconnectx/src/main/utils/SafeStorageString.ts',
    'apps/superconnectx/src/main/utils/BackupManager.ts',
    'apps/superconnectx/src/main/utils/PrintAppInfo.ts',
    'apps/superconnectx/src/main/protocol/BufferLineSplitter.ts',
    'apps/superconnectx/src/main/storage/BaseStorage.ts',
    'apps/superconnectx/src/main/storage/ConnectionStorage.ts',
    'apps/superconnectx/src/main/storage/CommandHistoryStorage.ts',
    'apps/superconnectx/src/main/storage/ShortcutsStorage.ts',
    'apps/superconnectx/src/main/storage/CommandGroupStorage.ts',
    'apps/superconnectx/src/main/storage/PreSetCommandStorage.ts',
    'apps/superconnectx/src/main/storage/SettingsStorage.ts',
    'apps/superconnectx/src/main/storage/AppSettingsStorage.ts',
    'apps/superconnectx/src/main/storage/ComSettingsStorage.ts',
    'apps/superconnectx/src/renderer/src/utils/EventBus.ts',
    'apps/superconnectx/src/renderer/src/utils/FileUtils.ts',
    'apps/superconnectx/src/renderer/src/utils/AnsiParser.ts',
    'apps/superconnectx/src/renderer/src/utils/FormUtils.ts',
    'apps/superconnectx/src/renderer/src/utils/FontDetector.ts',
    'apps/superconnectx/src/renderer/src/features/connections/protocol/telnet.ts',
    'apps/superconnectx/src/renderer/src/features/connections/protocol/ftp.ts',
    'apps/superconnectx/src/renderer/src/features/connections/protocol/com.ts',
    'apps/superconnectx/src/renderer/src/features/connections/protocol/http.ts',
    'apps/superconnectx/src/renderer/src/features/connections/protocol/ssh.ts',
    'apps/superconnectx/src/renderer/src/features/connections/protocol/tcp.ts',
    'apps/superconnectx/src/renderer/src/features/connections/protocol/udp.ts',
    'apps/superconnectx/src/renderer/src/features/connections/protocol/ping.ts',
    'apps/superconnectx/src/renderer/src/features/connections/protocol/tftp.ts',
    'apps/superconnectx/src/renderer/src/features/connections/protocol/base.ts',
    'apps/superconnectx/src/renderer/src/features/connections/protocol/index.ts',
    'apps/superconnectx/src/renderer/src/features/connections/protocol/TelnetInfo.ts',
    'apps/superconnectx/src/renderer/src/features/diagnostics/hex.ts',
    'apps/superconnectx/src/renderer/src/features/diagnostics/dataCheck.ts',
    'apps/superconnectx/src/main/utils/ProtocolLogger.ts'
  ],
  exclude: ['apps/superconnectx/out/**', 'node_modules/**', 'tests/**', '**/*.test.ts', '**/__mocks__/**']
}

export default defineConfig({
  test: {
    // 只跑单元测试（默认 vitest run）；workspace 包内测试一并纳入
    include: ['tests/unit/**/*.test.ts', 'packages/*/tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      ...commonCoverage,
      reportsDirectory: 'tests/coverage/unit',
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 90,
        branches: 75
      }
    },
    reporters: ['default', 'json', 'junit'],
    outputFile: {
      json: 'tests/report/unit-results.json',
      junit: 'tests/report/unit-junit.xml'
    }
  },
  resolve: {
    alias: commonAlias
  }
})
