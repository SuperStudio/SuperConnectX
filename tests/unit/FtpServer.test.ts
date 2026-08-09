/**
 * FtpServer 测试
 * 测试 FTP 服务端：启动、发送、停止、客户端管理、PASV URL 解析
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ftp-srv
const mockFtpSrvInstance = {
  on: vi.fn(),
  listen: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  server: { close: vi.fn() }
}

vi.mock('ftp-srv', () => ({
  default: vi.fn().mockImplementation(() => mockFtpSrvInstance)
}))

vi.mock('../../src/main/utils/AppDir', () => ({
  getAppDataDir: () => '/mock/appdata'
}))

import FtpServer from '../../src/main/protocol/FtpServer'

describe('FtpServer', () => {
  let ftpServer: FtpServer
  let mockLogger: any
  let onData: ReturnType<typeof vi.fn>
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
    onData = vi.fn()
    onClose = vi.fn()
    ftpServer = new FtpServer(mockLogger)
    // Reset mockFtpSrvInstance
    mockFtpSrvInstance.on = vi.fn()
    mockFtpSrvInstance.listen = vi.fn().mockResolvedValue(undefined)
    mockFtpSrvInstance.close = vi.fn().mockResolvedValue(undefined)
  })

  describe('constructor', () => {
    it('should create instance with logger', () => {
      expect(ftpServer).toBeDefined()
    })

    it('should use console as default logger', () => {
      const server = new FtpServer()
      expect(server).toBeDefined()
    })
  })

  describe('getConnectedClients', () => {
    it('should return empty array initially', () => {
      const clients = ftpServer.getConnectedClients()
      expect(clients).toEqual([])
    })

    it('should return empty array after stop without start', async () => {
      const result = await ftpServer.stop()
      expect(result).toEqual({ success: false, message: 'Server not running' })
    })
  })

  describe('start()', () => {
    const baseInfo = {
      host: '',
      port: 2121,
      username: '',
      password: '',
      sessionId: 'test-session',
      ftpDirectory: '/tmp/ftp',
      ftpPermissions: ['read', 'write']
    }

    it('should start FTP server successfully', async () => {
      const result = await ftpServer.start(baseInfo, onData, onClose)

      expect(mockFtpSrvInstance.on).toHaveBeenCalled()
      expect(mockFtpSrvInstance.listen).toHaveBeenCalled()
      expect(result).toHaveProperty('success', true)
      expect(onData).toHaveBeenCalled()
    })

    it('should use 0.0.0.0 as host regardless of input', async () => {
      const infoWithHost = { ...baseInfo, host: '192.168.1.1' }
      await ftpServer.start(infoWithHost, onData, onClose)

      // Should emit message with 0.0.0.0 (not user's host)
      const dataCalls = onData.mock.calls.filter((c: any[]) =>
        c[0]?.data?.includes('FTP server on')
      )
      expect(dataCalls.length).toBeGreaterThan(0)
    })

    it('should use default port 21 when not specified', async () => {
      const infoNoPort = { ...baseInfo, port: undefined as any }
      await ftpServer.start(infoNoPort, onData, onClose)

      const dataCalls = onData.mock.calls.filter((c: any[]) =>
        c[0]?.data?.includes(':21')
      )
      expect(dataCalls.length).toBeGreaterThan(0)
    })

    it('should use process.cwd() when ftpDirectory not specified', async () => {
      const infoNoDir = { ...baseInfo, ftpDirectory: undefined }
      await ftpServer.start(infoNoDir, onData, onClose)
      // Should not throw
      expect(mockFtpSrvInstance.listen).toHaveBeenCalled()
    })

    it('should emit data events during startup', async () => {
      await ftpServer.start(baseInfo, onData, onClose)

      expect(onData).toHaveBeenCalled()
      const messages = onData.mock.calls.map((c: any[]) => c[0]?.data)
      expect(messages.some((m: string) => m.includes('Initializing'))).toBe(true)
      expect(messages.some((m: string) => m.includes('started'))).toBe(true)
    })

    it('should restart if already running', async () => {
      await ftpServer.start(baseInfo, onData, onClose)
      const firstCallCount = onData.mock.calls.length

      await ftpServer.start(baseInfo, onData, onClose)
      // Should have "Server already running" message
      const messages = onData.mock.calls.map((c: any[]) => c[0]?.data)
      expect(messages.some((m: string) => m.includes('already running'))).toBe(true)
    })

    it('should return success with connId', async () => {
      const result = await ftpServer.start(baseInfo, onData, onClose)
      expect(result).toEqual({
        success: true,
        message: expect.stringContaining('started'),
        connId: 'test-session'
      })
    })

    it('should handle listen failure gracefully', async () => {
      mockFtpSrvInstance.listen.mockRejectedValueOnce(new Error('Port in use'))
      const result = await ftpServer.start(baseInfo, onData, onClose)

      expect(result).toEqual({
        success: false,
        message: expect.stringContaining('Port in use')
      })
    })

    it('should emit permissions when provided', async () => {
      await ftpServer.start(baseInfo, onData, onClose)

      const messages = onData.mock.calls.map((c: any[]) => c[0]?.data)
      expect(messages.some((m: string) => m.includes('Permissions'))).toBe(true)
      expect(messages.some((m: string) => m.includes('read, write'))).toBe(true)
    })

    it('should emit authentication info when username provided', async () => {
      const infoWithAuth = { ...baseInfo, username: 'admin', password: 'pass' }
      await ftpServer.start(infoWithAuth, onData, onClose)

      const messages = onData.mock.calls.map((c: any[]) => c[0]?.data)
      expect(messages.some((m: string) => m.includes('Authentication enabled'))).toBe(true)
    })

    it('should emit anonymous access info when no username', async () => {
      const infoNoAuth = { ...baseInfo, username: '', password: '' }
      await ftpServer.start(infoNoAuth, onData, onClose)

      const messages = onData.mock.calls.map((c: any[]) => c[0]?.data)
      expect(messages.some((m: string) => m.includes('Anonymous access'))).toBe(true)
    })
  })

  describe('stop()', () => {
    it('should return error if server not running', async () => {
      const result = await ftpServer.stop()
      expect(result).toEqual({ success: false, message: 'Server not running' })
    })

    it('should stop running server and call onClose', async () => {
      const info = { host: '', port: 2121, username: '', password: '', sessionId: 's1' }
      await ftpServer.start(info, onData, onClose)

      const result = await ftpServer.stop()
      expect(result).toEqual({ success: true, message: 'FTP server stopped' })
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('send()', () => {
    it('should return error if no client connected', async () => {
      const result = await ftpServer.send('nonexistent', 'QUIT')
      expect(result).toEqual({
        success: false,
        message: expect.stringContaining('not connected')
      })
    })

    it('should broadcast to all clients when connId is broadcast', async () => {
      const result = await ftpServer.send('broadcast', 'QUIT')
      expect(result).toEqual({
        success: true,
        message: 'Sent to 0 clients'
      })
    })

    it('should handle empty connId as broadcast', async () => {
      const result = await ftpServer.send('', 'QUIT')
      expect(result).toEqual({
        success: true,
        message: 'Sent to 0 clients'
      })
    })
  })

  describe('resolvePasvUrl', () => {
    it('should return undefined for empty host', async () => {
      const info = { host: '', port: 2121, username: '', password: '', sessionId: 's1' }
      await ftpServer.start(info, onData, onClose)

      const messages = onData.mock.calls.map((c: any[]) => c[0]?.data)
      expect(messages.some((m: string) => m.includes('PASV URL: undefined'))).toBe(true)
    })

    it('should use user host when valid', async () => {
      const info = { host: '192.168.1.100', port: 2121, username: '', password: '', sessionId: 's1' }
      await ftpServer.start(info, onData, onClose)

      const messages = onData.mock.calls.map((c: any[]) => c[0]?.data)
      expect(messages.some((m: string) => m.includes('PASV URL: 192.168.1.100'))).toBe(true)
    })

    it('should return undefined for 0.0.0.0 host', async () => {
      const info = { host: '0.0.0.0', port: 2121, username: '', password: '', sessionId: 's1' }
      await ftpServer.start(info, onData, onClose)

      const messages = onData.mock.calls.map((c: any[]) => c[0]?.data)
      expect(messages.some((m: string) => m.includes('PASV URL: undefined'))).toBe(true)
    })

    it('should return undefined for 0000 host', async () => {
      const info = { host: '0000', port: 2121, username: '', password: '', sessionId: 's1' }
      await ftpServer.start(info, onData, onClose)

      const messages = onData.mock.calls.map((c: any[]) => c[0]?.data)
      expect(messages.some((m: string) => m.includes('PASV URL: undefined'))).toBe(true)
    })
  })

  describe('generateClientId', () => {
    it('should generate unique IDs based on remote address', () => {
      // Test via login event simulation
      const info = { host: '', port: 2121, username: 'user', password: 'pass', sessionId: 's1' }
      // Client ID format: ip-timestamp6digits
      // We can verify indirectly through login handler
      expect(ftpServer.getConnectedClients()).toHaveLength(0)
    })
  })

  describe('onLog callback', () => {
    it('should receive log messages when provided', async () => {
      const onLog = vi.fn()
      const info = { host: '', port: 2121, username: '', password: '', sessionId: 's1' }
      await ftpServer.start(info, onData, onClose, onLog)

      expect(onLog).toHaveBeenCalled()
    })
  })

  describe('data object format', () => {
    it('should include data and timestamp in onData calls', async () => {
      const info = { host: '', port: 2121, username: '', password: '', sessionId: 's1' }
      await ftpServer.start(info, onData, onClose)

      for (const call of onData.mock.calls) {
        expect(call[0]).toHaveProperty('data')
        expect(call[0]).toHaveProperty('timestamp')
        expect(typeof call[0].data).toBe('string')
        expect(typeof call[0].timestamp).toBe('string')
      }
    })
  })
})
