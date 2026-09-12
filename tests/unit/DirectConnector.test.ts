/**
 * DirectConnector 测试
 * 测试 COM/Telnet 直连模式：start/send/stop/update + 回调工厂
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockComStart, mockComSend, mockComDisconnect, mockComUpdateConfig } = vi.hoisted(() => {
  return {
    mockComStart: vi.fn(async () => ({ success: true, message: 'connected' })),
    mockComSend: vi.fn(async () => ({ success: true })),
    mockComDisconnect: vi.fn(async () => ({ success: true })),
    mockComUpdateConfig: vi.fn(async () => ({ success: true }))
  }
})

// Mock protocol clients (ComClient/TelnetClient)
vi.mock('../../src/main/protocol/ComClient', () => ({
  default: class {
    start = mockComStart
    send = mockComSend
    disconnect = mockComDisconnect
    updateConfig = mockComUpdateConfig
  }
}))

vi.mock('../../src/main/protocol/TelnetClient', () => ({
  default: class {
    start = mockComStart
    send = mockComSend
    disconnect = mockComDisconnect
    updateConfig = mockComUpdateConfig
  }
}))

vi.mock('../../src/main/utils/ProtocolLogger', () => ({
  default: class {
    appendToConnLog = vi.fn()
    flushConnLog = vi.fn()
  }
}))

import DirectConnector from '../../src/main/ipc/connectors/DirectConnector'
import ConnectionStateManager from '../../src/main/ipc/connectors/ConnectionStateManager'
import ProtocolLogger from '../../src/main/utils/ProtocolLogger'

function makeConn(overrides: Partial<{ connectionType: string; sessionId: string; host: string; port: number; comName: string; receiveHex: boolean }> = {}): any {
  return {
    connectionType: 'com',
    sessionId: 's1',
    host: '127.0.0.1',
    port: 23,
    comName: 'COM1',
    baudRate: 9600,
    encoding: 'utf-8',
    username: '',
    password: '',
    receiveHex: false,
    logTimestamp: true,
    ftpMode: '',
    ftpDirectory: '',
    ftpPermissions: [],
    ...overrides
  }
}

function createDirectConnector(): { dc: DirectConnector; sm: ConnectionStateManager; logger: any } {
  const sm = new ConnectionStateManager()
  const logger = new ProtocolLogger() as any
  sm.init({ mainWindow: null }, logger)

  const dc = new DirectConnector(sm)
  dc.init({ mainWindow: null }, logger)
  return { dc, sm, logger }
}

describe('DirectConnector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============ startConnection ============

  describe('startConnection', () => {
    it('should create ComClient for COM connection', async () => {
      const { dc } = createDirectConnector()
      const conn = makeConn({ connectionType: 'com' })

      const result = await dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's1' })

      expect(result).toEqual({ success: true, message: 'connected' })
      expect(mockComStart).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Function),  // onData
        expect.any(Function),  // onClose
        expect.any(Function)   // onLog
      )
    })

    it('should create TelnetClient for telnet connection', async () => {
      const { dc } = createDirectConnector()
      const conn = makeConn({ connectionType: 'telnet' })

      const result = await dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's1' })

      expect(result).toEqual({ success: true, message: 'connected' })
    })

    it('should serialize two starts for the same session', async () => {
      let resolveFirst: ((result: object) => void) | undefined
      mockComStart.mockImplementationOnce((() => new Promise<object>((resolve) => {
        resolveFirst = resolve
      })) as any)

      const { dc } = createDirectConnector()
      const conn = makeConn({ sessionId: 's-serial' })
      const first = dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's-serial' })
      await vi.waitFor(() => expect(resolveFirst).toBeDefined())
      const second = dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's-serial' })

      expect(mockComStart).toHaveBeenCalledTimes(1)
      resolveFirst?.({ success: true })
      await expect(first).resolves.toEqual({ success: false, message: 'Direct mode start cancelled' })
      await expect(second).resolves.toEqual({ success: true, message: 'connected' })
      expect(mockComStart).toHaveBeenCalledTimes(2)
      expect(mockComDisconnect).toHaveBeenCalledTimes(1)
    })

    it('should not replace an existing client when disconnect fails', async () => {
      const { dc } = createDirectConnector()
      const conn = makeConn({ sessionId: 's-replace-fail' })
      const info = { host: '', port: 0, username: '', password: '', sessionId: 's-replace-fail' }
      await dc.startConnection(conn, info)
      mockComDisconnect.mockResolvedValueOnce({ success: false } as any)

      await expect(dc.startConnection(conn, info)).resolves.toEqual({ success: false })
      expect(mockComStart).toHaveBeenCalledTimes(1)
      await expect(dc.sendData(conn, 'test')).resolves.toEqual({ success: true })
    })
  })

  // ============ sendData ============

  describe('sendData', () => {
    it('should send data when client exists', async () => {
      const { dc } = createDirectConnector()
      const conn = makeConn({ connectionType: 'com', sessionId: 's1' })
      await dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's1' })

      const result = await dc.sendData(conn, 'AT\r\n')
      expect(result).toEqual({ success: true })
      expect(mockComSend).toHaveBeenCalledWith('s1', 'AT\r\n', expect.any(Function))
    })

    it('should return failure when client not initialized', async () => {
      const { dc } = createDirectConnector()
      const conn = makeConn({ connectionType: 'com', sessionId: 's-nonexist' })

      const result = await dc.sendData(conn, 'AT\r\n')
      expect(result).toEqual({ success: false, message: 'Direct mode client not initialized' })
    })
  })

  // ============ stopConnection ============

  describe('stopConnection', () => {
    it('should wait for a pending start before disconnecting', async () => {
      let resolveStart: ((result: object) => void) | undefined
      mockComStart.mockImplementationOnce((() => new Promise<object>((resolve) => {
        resolveStart = resolve
      })) as any)

      const { dc } = createDirectConnector()
      const conn = makeConn({ connectionType: 'com', sessionId: 's-pending' })
      const startPromise = dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's-pending' })
      await vi.waitFor(() => expect(resolveStart).toBeDefined())
      const stopPromise = dc.stopConnection(conn)

      expect(mockComDisconnect).not.toHaveBeenCalled()
      resolveStart?.({ success: true })
      await expect(stopPromise).resolves.toEqual({ success: true })
      await startPromise
      expect(mockComDisconnect).toHaveBeenCalledWith('s-pending')
    })

    it('should cancel queued starts and wait for the active start', async () => {
      let resolveStart: ((result: object) => void) | undefined
      mockComStart.mockImplementationOnce((() => new Promise<object>((resolve) => {
        resolveStart = resolve
      })) as any)

      const { dc } = createDirectConnector()
      const conn = makeConn({ sessionId: 's-cancel-queued' })
      const first = dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's-cancel-queued' })
      await vi.waitFor(() => expect(resolveStart).toBeDefined())
      const queued = dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's-cancel-queued' })
      const stop = dc.stopConnection(conn)

      expect(mockComStart).toHaveBeenCalledTimes(1)
      resolveStart?.({ success: true })
      await expect(stop).resolves.toEqual({ success: true })
      await expect(queued).resolves.toEqual({ success: false, message: 'Direct mode start cancelled' })
      await first
      expect(mockComDisconnect).toHaveBeenCalledTimes(1)
    })

    it('should disconnect and clean up client', async () => {
      const { dc } = createDirectConnector()
      const conn = makeConn({ connectionType: 'com', sessionId: 's1' })
      await dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's1' })

      const result = await dc.stopConnection(conn)
      expect(result).toEqual({ success: true })
      expect(mockComDisconnect).toHaveBeenCalledWith('s1')
    })

    it('should return success when client not found', async () => {
      const { dc } = createDirectConnector()
      const conn = makeConn({ connectionType: 'com', sessionId: 's-nonexist' })

      const result = await dc.stopConnection(conn)
      expect(result).toEqual({ success: true })
      expect(mockComDisconnect).not.toHaveBeenCalled()
    })

    it('should retain a client when disconnect fails', async () => {
      mockComDisconnect.mockResolvedValueOnce({ success: false } as any)
      const { dc } = createDirectConnector()
      const conn = makeConn({ sessionId: 's-close-error' })
      await dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's-close-error' })

      await expect(dc.stopConnection(conn)).resolves.toEqual({ success: false })
      await expect(dc.sendData(conn, 'test')).resolves.toEqual({ success: true })
    })
  })

  describe('cleanup', () => {
    it('disconnects all direct clients', async () => {
      const { dc } = createDirectConnector()
      const first = makeConn({ sessionId: 'cleanup-1' })
      const second = makeConn({ sessionId: 'cleanup-2' })
      await dc.startConnection(first, { host: '', port: 0, username: '', password: '', sessionId: 'cleanup-1' })
      await dc.startConnection(second, { host: '', port: 0, username: '', password: '', sessionId: 'cleanup-2' })

      await dc.cleanup()

      expect(mockComDisconnect).toHaveBeenCalledWith('cleanup-1')
      expect(mockComDisconnect).toHaveBeenCalledWith('cleanup-2')
      await expect(dc.sendData(first, 'test')).resolves.toMatchObject({ success: false })
    })
  })

  // ============ updateConnectionConfig ============

  describe('updateConnectionConfig', () => {
    it('should update config when client exists', async () => {
      const { dc } = createDirectConnector()
      const conn = makeConn({ connectionType: 'com', sessionId: 's1' })
      await dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's1' })

      const result = await dc.updateConnectionConfig(conn, { receiveHex: true })
      expect(result).toEqual({ success: true })
      expect(mockComUpdateConfig).toHaveBeenCalledWith('s1', { receiveHex: true })
    })

    it('should return failure when client not found', async () => {
      const { dc } = createDirectConnector()
      const conn = makeConn({ connectionType: 'com', sessionId: 's-nonexist' })

      const result = await dc.updateConnectionConfig(conn, { receiveHex: true })
      expect(result).toEqual({ success: false, message: 'Direct mode client not initialized' })
    })
  })

  // ============ 回调工厂（通过 startConnection 间接触发） ============

  describe('callback factories (via startConnection)', () => {
    it('onData should call stateManager.sendDataToRenderer with raw data', async () => {
      const { dc, sm } = createDirectConnector()
      const sendSpy = vi.spyOn(sm, 'sendDataToRenderer')

      const conn = makeConn({ connectionType: 'com', sessionId: 's1', receiveHex: false })
      await dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's1' })

      // Extract the onData callback from mockComStart call
      const onData = mockComStart.mock.calls[0][1]
      onData({ data: 'hello', timestamp: '12:00:00' })

      expect(sendSpy).toHaveBeenCalledWith('s1', 'hello', '12:00:00', false)
    })

    it('ignores data and log callbacks from a replaced client', async () => {
      const { dc, sm, logger } = createDirectConnector()
      const sendSpy = vi.spyOn(sm, 'sendDataToRenderer')
      const conn = makeConn({ sessionId: 's-replaced' })

      await dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's-replaced' })
      const oldOnData = mockComStart.mock.calls[0][1]
      const oldOnLog = mockComStart.mock.calls[0][3]
      await dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's-replaced' })

      oldOnData({ data: 'stale', timestamp: '12:00:00' })
      oldOnLog('stale log', '12:00:00')

      expect(sendSpy).not.toHaveBeenCalled()
      expect(logger.appendToConnLog).not.toHaveBeenCalled()
    })

    it('onData should pass through data directly when receiveHex is true (HEX conversion moved to BufferLineSplitter)', async () => {
      const { dc, sm } = createDirectConnector()
      const sendSpy = vi.spyOn(sm, 'sendDataToRenderer')

      const conn = makeConn({ connectionType: 'com', sessionId: 's1' })
      sm.setReceiveHex('s1', true)
      await dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's1' })

      const onData = mockComStart.mock.calls[0][1]
      onData({ data: 'A', timestamp: '12:00:00' })

      // HEX 转换已下沉到 BufferLineSplitter.decodeBuffer()，DirectConnector 直接透传
      expect(sendSpy).toHaveBeenCalledWith('s1', 'A', '12:00:00', true)
    })

    it('onClose should call stateManager.cleanupOnClose and delete client', async () => {
      const { dc, sm } = createDirectConnector()
      const cleanupSpy = vi.spyOn(sm, 'cleanupOnClose')

      const conn = makeConn({ connectionType: 'com', sessionId: 's1' })
      await dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's1' })

      const onClose = mockComStart.mock.calls[0][2]
      onClose()

      expect(cleanupSpy).toHaveBeenCalledWith('s1')

      // After close, client should be removed from map
      const result = await dc.sendData(conn, 'test')
      expect(result.success).toBe(false)
    })

    it('should not let an old client onClose delete the new client', async () => {
      const { dc, sm } = createDirectConnector()
      const cleanupSpy = vi.spyOn(sm, 'cleanupOnClose')
      const conn = makeConn({ sessionId: 's-generations' })

      await dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's-generations' })
      const oldOnClose = mockComStart.mock.calls[0][2]
      await dc.stopConnection(conn)
      await dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's-generations' })

      oldOnClose()
      expect(cleanupSpy).toHaveBeenCalledTimes(0)
      await expect(dc.sendData(conn, 'test')).resolves.toEqual({ success: true })
    })

    it('onLog should call logger.appendToConnLog with proper format', async () => {
      const { dc, sm, logger } = createDirectConnector()
      const appendSpy = vi.spyOn(logger, 'appendToConnLog')

      const conn = makeConn({ connectionType: 'com', sessionId: 's1' })
      sm.setLogTimestamp('s1', true)
      await dc.startConnection(conn, { host: '', port: 0, username: '', password: '', sessionId: 's1' })

      const onLog = mockComStart.mock.calls[0][3]
      onLog('connected', '12:00:00')

      expect(appendSpy).toHaveBeenCalledWith('[12:00:00] connected', 's1')
    })
  })
})
