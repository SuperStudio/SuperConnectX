import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const commonAlias = {
  '@': resolve('src'),
  // 用 mock 替代 electron 模块
  electron: resolve('tests/__mocks__/electron.ts'),
  // 用 mock 替代 electron-store 模块
  'electron-store': resolve('tests/__mocks__/electron-store.ts'),
  // 用 mock 替代 logger (避免 import 链导致 fs 等问题)
  '../ipc/IpcAppLogger': resolve('tests/__mocks__/IpcAppLogger.ts'),
  // 用 mock 替代 serialport (避免原生模块依赖)
  'serialport': resolve('tests/__mocks__/serialport.ts')
}

const commonCoverage = {
  provider: 'v8' as const,
  reporter: ['text', 'html', 'json-summary'],
  include: [
    'src/main/utils/DataCheckEngine.ts',
    'src/main/utils/SafeStorageString.ts',
    'src/main/utils/BackupManager.ts',
    'src/main/utils/PrintAppInfo.ts',
    'src/main/protocol/BufferLineSplitter.ts',
    'src/main/storage/BaseStorage.ts',
    'src/main/storage/ConnectionStorage.ts',
    'src/main/storage/CommandHistoryStorage.ts',
    'src/main/storage/ShortcutsStorage.ts',
    'src/main/storage/CommandGroupStorage.ts',
    'src/main/storage/PreSetCommandStorage.ts',
    'src/main/storage/SettingsStorage.ts',
    'src/main/storage/AppSettingsStorage.ts',
    'src/main/storage/ComSettingsStorage.ts',
    'src/renderer/src/utils/EventBus.ts',
    'src/renderer/src/utils/FileUtils.ts',
    'src/renderer/src/utils/AnsiParser.ts',
    'src/renderer/src/utils/FormUtils.ts',
    'src/renderer/src/utils/FontDetector.ts',
    'src/renderer/src/entity/protocol/telnet.ts',
    'src/renderer/src/entity/protocol/ftp.ts',
    'src/renderer/src/entity/protocol/com.ts',
    'src/renderer/src/entity/protocol/http.ts',
    'src/renderer/src/entity/protocol/ssh.ts',
    'src/renderer/src/entity/protocol/tcp.ts',
    'src/renderer/src/entity/protocol/udp.ts',
    'src/renderer/src/entity/protocol/ping.ts',
    'src/renderer/src/entity/protocol/tftp.ts',
    'src/renderer/src/entity/protocol/base.ts',
    'src/renderer/src/entity/protocol/index.ts',
    'src/renderer/src/entity/protocol/TelnetInfo.ts',
    'src/main/utils/ProtocolLogger.ts'
  ],
  exclude: [
    'out/**',
    'node_modules/**',
    'tests/**',
    '**/*.test.ts',
    '**/__mocks__/**'
  ]
}

export default defineConfig({
  test: {
    // 只跑单元测试（默认 vitest run）
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      ...commonCoverage,
      reportsDirectory: 'tests/coverage/unit'
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
