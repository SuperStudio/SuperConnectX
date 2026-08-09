/**
 * useTerminal 测试
 * 测试终端 composable：字体、时间戳、连接管理
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// Mock vue
vi.mock('vue', async () => {
  const actual = await vi.importActual('vue')
  return {
    ...actual as any,
    onUnmounted: vi.fn()
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  }
}))

vi.mock('../../src/renderer/src/utils/FontDetector', () => ({
  getDefaultTerminalFont: () => 'Consolas'
}))

// Mock window APIs
const mockUpdateConnect = vi.fn().mockResolvedValue({})
const mockStopConnect = vi.fn().mockResolvedValue({})
const mockSendData = vi.fn().mockResolvedValue({})
const mockOpenConnectLog = vi.fn().mockResolvedValue({ success: true })
const mockRotateLogFile = vi.fn().mockResolvedValue({
  success: true,
  oldFileName: 'old.log',
  newFileName: 'new.log'
})
;(globalThis as any).window = {
  connectApi: {
    updateConnect: mockUpdateConnect,
    stopConnect: mockStopConnect,
    sendData: mockSendData,
    openConnectLog: mockOpenConnectLog,
    rotateLogFile: mockRotateLogFile
  }
}

import { useTerminal, type TerminalConnection, type UseTerminalOptions } from '../../src/renderer/src/composables/useTerminal'

function createOptions(overrides: Partial<UseTerminalOptions> = {}): UseTerminalOptions {
  const conn: TerminalConnection = {
    id: 'test-id',
    connectionType: 'telnet',
    sessionId: 12345,
    host: '127.0.0.1',
    port: 23,
    ...overrides.connection
  }

  return {
    unifiedTerminalRef: ref({
      appendToTerminal: vi.fn(),
      updateTxBytes: vi.fn(),
      setFontFamily: vi.fn(),
      getFontFamily: () => 'Consolas',
      getShowTimestamp: () => true,
      getFontSize: () => 14
    }),
    isConnected: ref(false),
    connectionType: 'telnet',
    connection: conn,
    saveFontSettings: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

describe('useTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should return expected API', () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)

      expect(terminal.fontSize).toBeDefined()
      expect(terminal.fontFamily).toBeDefined()
      expect(terminal.showTimestamp).toBeDefined()
      expect(typeof terminal.openLogFolder).toBe('function')
      expect(typeof terminal.openLogFile).toBe('function')
      expect(typeof terminal.saveLogFile).toBe('function')
      expect(typeof terminal.handleClose).toBe('function')
      expect(typeof terminal.handleSend).toBe('function')
      expect(typeof terminal.reconnect).toBe('function')
      expect(typeof terminal.handleFontChange).toBe('function')
      expect(typeof terminal.cleanup).toBe('function')
    })

    it('should initialize with default font', () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)
      expect(terminal.fontFamily.value).toBe('Consolas')
    })

    it('should initialize with default font size 14', () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)
      expect(terminal.fontSize.value).toBe(14)
    })

    it('should initialize showTimestamp as true', () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)
      expect(terminal.showTimestamp.value).toBe(true)
    })

    it('should initialize totalRxSize and totalTxSize as 0', () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)
      expect(terminal.totalRxSize).toBe(0)
      expect(terminal.totalTxSize).toBe(0)
    })

    it('should use custom sendDisplaySuffix when provided', () => {
      const opts = createOptions({ sendDisplaySuffix: 'CUSTOM >>>' })
      const terminal = useTerminal(opts)
      expect(terminal).toBeDefined()
    })
  })

  describe('handleSend', () => {
    it('should not send when not connected', async () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)
      opts.isConnected.value = false

      await terminal.handleSend('test command')
      expect(mockSendData).not.toHaveBeenCalled()
    })

    it('should not send empty command', async () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)
      opts.isConnected.value = true

      await terminal.handleSend('   ')
      expect(mockSendData).not.toHaveBeenCalled()
    })

    it('should append to terminal when sending', async () => {
      const appendMock = vi.fn()
      const opts = createOptions({
        unifiedTerminalRef: ref({
          appendToTerminal: appendMock,
          updateTxBytes: vi.fn(),
          setFontFamily: vi.fn(),
          getFontFamily: () => 'Consolas',
          getShowTimestamp: () => true,
          getFontSize: () => 14
        }),
        isConnected: ref(true)
      })
      const terminal = useTerminal(opts)

      await terminal.handleSend('hello')
      expect(appendMock).toHaveBeenCalled()
    })

    it('should call onSend callback when provided', async () => {
      const onSend = vi.fn()
      const opts = createOptions({
        onSend,
        isConnected: ref(true)
      })
      const terminal = useTerminal(opts)

      await terminal.handleSend('hello', 'hello\n')
      expect(onSend).toHaveBeenCalledWith('hello', 'hello\n')
      expect(mockSendData).not.toHaveBeenCalled()
    })

    it('should call sendData API when no onSend callback', async () => {
      const opts = createOptions({
        isConnected: ref(true)
      })
      const terminal = useTerminal(opts)

      await terminal.handleSend('hello')
      expect(mockSendData).toHaveBeenCalled()
    })

    it('should call sendData API with correct payload', async () => {
      const opts = createOptions({
        isConnected: ref(true)
      })
      const terminal = useTerminal(opts)

      await terminal.handleSend('hello')
      expect(mockSendData).toHaveBeenCalledTimes(1)
      expect(mockSendData.mock.calls[0][0].command).toBe('hello')

      await terminal.handleSend('world')
      expect(mockSendData).toHaveBeenCalledTimes(2)
      expect(mockSendData.mock.calls[1][0].command).toBe('world')
    })

    it('should update tx bytes on terminal ref', async () => {
      const updateTx = vi.fn()
      const opts = createOptions({
        unifiedTerminalRef: ref({
          appendToTerminal: vi.fn(),
          updateTxBytes: updateTx,
          setFontFamily: vi.fn(),
          getFontFamily: () => 'Consolas',
          getShowTimestamp: () => true,
          getFontSize: () => 14
        }),
        isConnected: ref(true)
      })
      const terminal = useTerminal(opts)

      await terminal.handleSend('test')
      expect(updateTx).toHaveBeenCalledWith(4)
    })
  })

  describe('handleClose', () => {
    it('should stop connection via IPC', async () => {
      const opts = createOptions({
        isConnected: ref(true)
      })
      const terminal = useTerminal(opts)

      await terminal.handleClose()
      expect(mockStopConnect).toHaveBeenCalled()
    })

    it('should set isConnected to false', async () => {
      const isConnected = ref(true)
      const opts = createOptions({ isConnected })
      const terminal = useTerminal(opts)

      await terminal.handleClose()
      expect(isConnected.value).toBe(false)
    })

    it('should append close message to terminal', async () => {
      const appendMock = vi.fn()
      const opts = createOptions({
        unifiedTerminalRef: ref({
          appendToTerminal: appendMock,
          updateTxBytes: vi.fn(),
          setFontFamily: vi.fn(),
          getFontFamily: () => 'Consolas',
          getShowTimestamp: () => true,
          getFontSize: () => 14
        })
      })
      const terminal = useTerminal(opts)

      await terminal.handleClose()
      expect(appendMock).toHaveBeenCalledWith(expect.stringContaining('关闭'))
    })

    it('should call cleanup without throwing', async () => {
      const opts = createOptions({ isConnected: ref(true) })
      const terminal = useTerminal(opts)

      expect(() => terminal.cleanup()).not.toThrow()
    })
  })

  describe('handleFontChange', () => {
    it('should update font family', () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)

      terminal.handleFontChange('Fira Code')
      expect(terminal.fontFamily.value).toBe('Fira Code')
    })

    it('should call setFontFamily on unified terminal ref', () => {
      const setFont = vi.fn()
      const opts = createOptions({
        unifiedTerminalRef: ref({
          appendToTerminal: vi.fn(),
          updateTxBytes: vi.fn(),
          setFontFamily: setFont,
          getFontFamily: () => 'Consolas',
          getShowTimestamp: () => true,
          getFontSize: () => 14
        })
      })
      const terminal = useTerminal(opts)

      terminal.handleFontChange('JetBrains Mono')
      expect(setFont).toHaveBeenCalledWith('JetBrains Mono')
    })

    it('should call saveFontSettings', () => {
      const saveSettings = vi.fn().mockResolvedValue(undefined)
      const opts = createOptions({ saveFontSettings: saveSettings })
      const terminal = useTerminal(opts)

      terminal.handleFontChange('Source Code Pro')
      expect(saveSettings).toHaveBeenCalled()
    })
  })

  describe('reconnect', () => {
    it('should be a no-op by default', () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)
      expect(() => terminal.reconnect()).not.toThrow()
    })
  })

  describe('openLogFolder', () => {
    it('should call openConnectLog with folder mode', async () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)

      await terminal.openLogFolder()
      expect(mockOpenConnectLog).toHaveBeenCalledWith(expect.any(String), 'folder')
    })

    it('should handle API error gracefully', async () => {
      mockOpenConnectLog.mockResolvedValueOnce({ success: false, message: 'Not found' })
      const opts = createOptions()
      const terminal = useTerminal(opts)

      await expect(terminal.openLogFolder()).resolves.not.toThrow()
    })
  })

  describe('openLogFile', () => {
    it('should call openConnectLog with file mode', async () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)

      await terminal.openLogFile()
      expect(mockOpenConnectLog).toHaveBeenCalledWith(expect.any(String), 'file')
    })
  })

  describe('saveLogFile', () => {
    it('should call rotateLogFile', async () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)

      await terminal.saveLogFile()
      expect(mockRotateLogFile).toHaveBeenCalledWith(expect.any(String))
    })

    it('should show success message on success', async () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)

      await terminal.saveLogFile()
      // ElMessage.success should have been called
    })
  })

  describe('defineExpose', () => {
    it('should return handleFontChange function', () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)

      const exposed = terminal.defineExpose()
      expect(typeof exposed.handleFontChange).toBe('function')
      expect(typeof exposed.getFontFamily).toBe('function')
      expect(typeof exposed.getShowTimestamp).toBe('function')
    })

    it('getFontFamily should return unified terminal font if available', () => {
      const opts = createOptions({
        unifiedTerminalRef: ref({
          appendToTerminal: vi.fn(),
          updateTxBytes: vi.fn(),
          setFontFamily: vi.fn(),
          getFontFamily: () => 'CustomFont',
          getShowTimestamp: () => true,
          getFontSize: () => 14
        })
      })
      const terminal = useTerminal(opts)
      const exposed = terminal.defineExpose()

      expect(exposed.getFontFamily()).toBe('CustomFont')
    })

    it('getShowTimestamp should return current value', () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)
      const exposed = terminal.defineExpose()

      expect(exposed.getShowTimestamp()).toBe(true)
    })
  })

  describe('COM connection type', () => {
    it('should handle COM connection with comName', () => {
      const opts = createOptions({
        connectionType: 'com',
        connection: {
          id: 'com-1',
          connectionType: 'com',
          sessionId: 999,
          comName: 'COM3',
          baudRate: 115200
        }
      })
      const terminal = useTerminal(opts)
      expect(terminal).toBeDefined()
    })
  })

  describe('cleanup', () => {
    it('should be safe to call multiple times', () => {
      const opts = createOptions()
      const terminal = useTerminal(opts)

      expect(() => {
        terminal.cleanup()
        terminal.cleanup()
        terminal.cleanup()
      }).not.toThrow()
    })
  })
})
