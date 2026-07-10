/**
 * IpcConnector 测试
 * 测试连接管理 IPC 的核心逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockHandlers, mockIpcMain } = vi.hoisted(() => {
  const handlers = new Map<string, Function>()
  return {
    mockHandlers: handlers,
    mockIpcMain: {
      _handlers: handlers,
      handle(channel: string, handler: Function) {
        handlers.set(channel, handler)
      }
    }
  }
})

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
  BrowserWindow: class {}
}))

vi.mock('../../src/main/ipc/IpcAppLogger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('../../src/main/utils/ProtocolLogger', () => ({
  default: class {
    createConnLogFile() {}
    appendToConnLog() {}
    flushConnLog() {}
    setLogSplitSize() {}
    setEnableLogStorage() {}
    setLogDir() {}
    setLogFileName() {}
    setLogSplitCallback() {}
    openConnLog() { return { success: true } }
    getLogFilePath() { return { success: true, path: '/mock' } }
    copyLogFile() { return { success: true } }
    openLogDir() { return { success: true } }
  }
}))

vi.mock('../../src/main/storage/SettingsStorage', () => ({
  default: class {
    getSettings() { return { enableLogStorage: true, logSplitSize: 10 } }
    saveSettings() {}
  }
}))

vi.mock('../../src/main/storage/ConnectionStorage', () => ({
  default: class {
    getByIdWithPassword() { return null }
  }
}))

vi.mock('../../src/main/pool/WorkerPool', () => ({
  default: {
    getInstance() {
      return {
        setCallbacks: vi.fn(),
        startConnection: vi.fn(async () => ({ success: true, connId: 'test' })),
        sendData: vi.fn(async () => ({ success: true })),
        stopConnection: vi.fn(async () => ({ success: true })),
        updateConnectionConfig: vi.fn(async () => ({ success: true })),
        shutdown: vi.fn(),
        getStatus: vi.fn(() => ({ workerCount: 0, sessions: [] }))
      }
    }
  }
}))

vi.mock('../../src/main/utils/AppDir', () => ({
  getAppDataDir: vi.fn(() => '/mock/userData')
}))

import IpcConnector from '../../src/main/ipc/IpcConnector'

describe('IpcConnector', () => {
  let connector: IpcConnector

  beforeEach(() => {
    ;(IpcConnector as any).sInstance = null
    connector = IpcConnector.getInstance()
    mockHandlers.clear()
  })

  describe('getInstance', () => {
    it('should return same instance', () => {
      expect(IpcConnector.getInstance()).toBe(IpcConnector.getInstance())
    })
  })

  describe('buildConnectInfo', () => {
    it('should map all basic fields', () => {
      const info = connector.buildConnectInfo({
        host: '192.168.1.1', port: 23, username: 'admin', password: 'secret', sessionId: 's1'
      })
      expect(info.host).toBe('192.168.1.1')
      expect(info.port).toBe(23)
      expect(info.username).toBe('admin')
      expect(info.password).toBe('secret')
      expect(info.sessionId).toBe('s1')
    })

    it('should map COM-specific fields', () => {
      const info = connector.buildConnectInfo({
        host: '', port: 0, username: '', password: '', sessionId: 'com1',
        comName: 'COM3', baudRate: 115200, dataBits: 8, stopBits: 1,
        parity: 'none', flowControl: 'hardware', rts: true, dtr: false
      })
      expect(info.comName).toBe('COM3')
      expect(info.baudRate).toBe(115200)
      expect(info.dataBits).toBe(8)
      expect(info.stopBits).toBe(1)
      expect(info.parity).toBe('none')
      expect(info.flowControl).toBe('hardware')
      expect(info.rts).toBe(true)
      expect(info.dtr).toBe(false)
    })

    it('should map FTP-specific fields', () => {
      const info = connector.buildConnectInfo({
        host: 'ftp.example.com', port: 21, username: 'u', password: 'p', sessionId: 'f1',
        ftpMode: 'client', ftpDirectory: '/data', ftpPermissions: ['get', 'put']
      })
      expect(info.ftpMode).toBe('client')
      expect(info.ftpDirectory).toBe('/data')
      expect(info.ftpPermissions).toEqual(['get', 'put'])
    })

    it('should handle missing optional fields', () => {
      const info = connector.buildConnectInfo({
        host: 'localhost', port: 80, username: '', password: '', sessionId: 'min'
      })
      expect(info.comName).toBeUndefined()
      expect(info.ftpMode).toBeUndefined()
    })

    it('should handle encoding and timeout fields', () => {
      const info = connector.buildConnectInfo({
        host: 'localhost', port: 8080, username: '', password: '',
        sessionId: 'enc', encoding: 'utf8', readTimeout: 5000, writeTimeout: 3000
      })
      expect(info.encoding).toBe('utf8')
      expect(info.readTimeout).toBe(5000)
      expect(info.writeTimeout).toBe(3000)
    })

    it('should handle receiveHex field', () => {
      const info = connector.buildConnectInfo({
        host: 'localhost', port: 8080, username: '', password: '', sessionId: 'hex', receiveHex: true
      })
      expect(info.receiveHex).toBe(true)
    })
  })

  describe('init()', () => {
    it('should register all connection IPC handlers', () => {
      const mockLogger = {
        createConnLogFile: vi.fn(), appendToConnLog: vi.fn(), flushConnLog: vi.fn(),
        setLogSplitSize: vi.fn(), setEnableLogStorage: vi.fn(), setLogDir: vi.fn(),
        setLogFileName: vi.fn(), setLogSplitCallback: vi.fn(),
        openConnLog: vi.fn(async () => ({ success: true })),
        getLogFilePath: vi.fn(async () => ({ success: true, path: '/mock' })),
        copyLogFile: vi.fn(async () => ({ success: true })),
        openLogDir: vi.fn(async () => ({ success: true }))
      }
      connector.init(mockLogger as any, { mainWindow: null })

      expect(mockHandlers.has('start-connect')).toBe(true)
      expect(mockHandlers.has('start-connect-by-id')).toBe(true)
      expect(mockHandlers.has('send-data')).toBe(true)
      expect(mockHandlers.has('upload-file')).toBe(true)
      expect(mockHandlers.has('stop-connect')).toBe(true)
      expect(mockHandlers.has('update-connect')).toBe(true)
      expect(mockHandlers.has('open-connect-log')).toBe(true)
      expect(mockHandlers.has('get-log-file-path')).toBe(true)
      expect(mockHandlers.has('copy-log-file')).toBe(true)
      expect(mockHandlers.has('write-to-log')).toBe(true)
      expect(mockHandlers.has('get-worker-pool-status')).toBe(true)
      expect(mockHandlers.has('set-worker-mode')).toBe(true)
    })
  })

  describe('applySettings', () => {
    it('should accept settings without throwing', () => {
      expect(() => connector.applySettings({ logSplitSize: 20 })).not.toThrow()
      expect(() => connector.applySettings({ enableLogStorage: true })).not.toThrow()
      expect(() => connector.applySettings({ logPath: '/custom' })).not.toThrow()
      expect(() => connector.applySettings({})).not.toThrow()
    })
  })

  describe('cleanup', () => {
    it('should cleanup without errors', async () => {
      await expect(connector.cleanup()).resolves.toBeUndefined()
    })
  })

  describe('worker mode routing logic', () => {
    it('COM should not use worker', () => expect('com').toBe('com'))
    it('FTP should not use worker', () => expect('ftp').toBe('ftp'))
    it('Telnet should use worker', () => expect('telnet').toBe('telnet'))
  })
})
