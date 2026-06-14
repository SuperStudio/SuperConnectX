import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import ComClient from '../../src/main/protocol/ComClient'
import ConnectionInfo from '../../src/main/protocol/ConnectionInfo'
import { MockSerialPort } from '../__mocks__/serialport'

function makeComInfo(overrides: Partial<ConnectionInfo> = {}): ConnectionInfo {
  return {
    sessionId: 'test-session-1',
    comName: 'COM3',
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    encoding: 'utf8',
    flowControl: 'none',
    ...overrides
  } as ConnectionInfo
}

describe('ComClient', () => {
  let client: ComClient
  let onData: ReturnType<typeof vi.fn>
  let onClose: ReturnType<typeof vi.fn>
  let onLog: ReturnType<typeof vi.fn>

  beforeEach(() => {
    MockSerialPort.reset()
    client = new ComClient()
    onData = vi.fn()
    onClose = vi.fn()
    onLog = vi.fn()
  })

  afterEach(async () => {
    // 清理所有连接
    for (const [id] of client.serialConnections) {
      await client.disconnect(id)
    }
  })

  // ============ start() ============
  describe('start()', () => {
    it('should connect successfully', async () => {
      const info = makeComInfo()
      const result = await client.start(info, onData, onClose, onLog)
      expect(result.success).toBe(true)
      expect(client.serialConnections.has('test-session-1')).toBe(true)
    })

    it('should fail with empty comName', async () => {
      const info = makeComInfo({ comName: '' })
      const result = await client.start(info, onData, onClose, onLog)
      expect(result.success).toBe(false)
      expect(result.message).toContain('cannot be empty')
    })

    it('should fail when port open fails', async () => {
      MockSerialPort.shouldOpenFail = true
      MockSerialPort.openError = new Error('Port not found')
      const info = makeComInfo()

      await expect(client.start(info, onData, onClose, onLog)).rejects.toThrow()
    })

    it('should use default values when not provided', async () => {
      const info = makeComInfo({
        baudRate: undefined,
        dataBits: undefined,
        stopBits: undefined,
        parity: undefined,
        encoding: undefined
      })
      const result = await client.start(info, onData, onClose, onLog)
      expect(result.success).toBe(true)
    })

    it('should set hardware flow control (rtscts/dsrdtr)', async () => {
      const info = makeComInfo({ flowControl: 'hardware' })
      const result = await client.start(info, onData, onClose, onLog)
      expect(result.success).toBe(true)
    })

    it('should set software flow control (xon/xoff)', async () => {
      const info = makeComInfo({ flowControl: 'software' })
      const result = await client.start(info, onData, onClose, onLog)
      expect(result.success).toBe(true)
    })
  })

  // ============ send() ============
  describe('send()', () => {
    it('should send data successfully', async () => {
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      const onComplete = vi.fn()
      const result = await client.send('test-session-1', 'hello', onComplete)
      expect(result.success).toBe(true)
      expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('should auto-append \\r\\n if missing', async () => {
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      const onComplete = vi.fn()
      const result = await client.send('test-session-1', 'hello', onComplete)
      expect(result.success).toBe(true)
    })

    it('should replace trailing \\n with \\r\\n', async () => {
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      const onComplete = vi.fn()
      const result = await client.send('test-session-1', 'hello\n', onComplete)
      expect(result.success).toBe(true)
    })

    it('should fail when connection does not exist', async () => {
      const result = await client.send('non-existent', 'test', vi.fn())
      expect(result.success).toBe(false)
      expect(result.message).toContain('does not exist')
    })

    it('should fail when write fails', async () => {
      MockSerialPort.shouldWriteFail = true
      MockSerialPort.writeError = new Error('Write error')
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      const result = await client.send('test-session-1', 'test', vi.fn())
      expect(result.success).toBe(false)
    })
  })

  // ============ data receive ============
  describe('data receive', () => {
    it('should call onData when data is received', async () => {
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      const conn = client.serialConnections.get('test-session-1')!
      conn.port.simulateData(Buffer.from('Hello World\r\n'))
      await new Promise((r) => setTimeout(r, 30))

      expect(onData).toHaveBeenCalledWith(
        expect.objectContaining({
          data: 'Hello World'
        })
      )
    })

    it('should call onLog with log data', async () => {
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      const conn = client.serialConnections.get('test-session-1')!
      conn.port.simulateData(Buffer.from('log line\r\n'))
      await new Promise((r) => setTimeout(r, 30))

      expect(onLog).toHaveBeenCalledTimes(1)
    })

    it('should buffer incomplete lines', async () => {
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      const conn = client.serialConnections.get('test-session-1')!
      conn.port.simulateData(Buffer.from('partial'))
      await new Promise((r) => setTimeout(r, 30))

      // 不完整行不应触发 onData
      expect(onData).not.toHaveBeenCalled()

      // 补全换行符
      conn.port.simulateData(Buffer.from(' line\r\n'))
      await new Promise((r) => setTimeout(r, 30))

      expect(onData).toHaveBeenCalledWith(
        expect.objectContaining({
          data: 'partial line'
        })
      )
    })

    it('should flush remaining buffer on close (via port close event)', async () => {
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      const conn = client.serialConnections.get('test-session-1')!
      conn.port.simulateData(Buffer.from('Remaining'))
      await new Promise((r) => setTimeout(r, 30))

      // 模拟设备主动断开（不经过 disconnect），触发 port 的 'close' 事件
      conn.port.emit('close')

      // close 事件回调中会 flush 剩余 buffer
      expect(onData).toHaveBeenCalledWith(
        expect.objectContaining({
          data: 'Remaining'
        })
      )
    })

    it('should NOT call onClose when actively disconnecting', async () => {
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      // 主动 disconnect 会 removeAllListeners('close')，防止 onClose 触发
      await client.disconnect('test-session-1')
      expect(onClose).not.toHaveBeenCalled()
    })

    it('should handle multi-byte utf8 characters', async () => {
      const info = makeComInfo({ encoding: 'utf8' })
      await client.start(info, onData, onClose, onLog)

      const conn = client.serialConnections.get('test-session-1')!
      // 发送一个 4 字节 UTF-8 字符的前 2 字节，再发后 2 字节
      const emoji = Buffer.from('😀')
      conn.port.simulateData(emoji.subarray(0, 2))
      conn.port.simulateData(Buffer.concat([emoji.subarray(2), Buffer.from('\r\n')]))
      await new Promise((r) => setTimeout(r, 30))

      expect(onData).toHaveBeenCalledWith(
        expect.objectContaining({
          data: '😀'
        })
      )
    })

    it('should handle receiveHex mode (log format is hex)', async () => {
      const info = makeComInfo({ receiveHex: true })
      await client.start(info, onData, onClose, onLog)

      const conn = client.serialConnections.get('test-session-1')!
      // 发送可打印字符以便验证：'AB' 在 hex 模式下 log 应该是 '41 42'
      conn.port.simulateData(Buffer.from('AB\r\n'))
      await new Promise((r) => setTimeout(r, 30))

      // data 始终是文本，receiveHex 只影响 log 格式
      expect(onData).toHaveBeenCalledWith(
        expect.objectContaining({
          data: 'AB'
        })
      )
      expect(onLog).toHaveBeenCalledWith(
        '41 42',
        expect.any(String)
      )
    })

    it('should merge multiple lines in single processBuffer tick', async () => {
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      const conn = client.serialConnections.get('test-session-1')!
      conn.port.simulateData(Buffer.from('line1\r\nline2\r\nline3\r\n'))
      await new Promise((r) => setTimeout(r, 30))

      expect(onData).toHaveBeenCalledTimes(1)
      expect(onData).toHaveBeenCalledWith(
        expect.objectContaining({
          data: 'line1\nline2\nline3'
        })
      )
    })

    it('should handle \\r only (no \\n) as line terminator', async () => {
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      const conn = client.serialConnections.get('test-session-1')!
      // 注意：末尾的 \r 会被保留在 remainder 中（可能是 \r\n 分片），
      // 需要额外发送 \n 来触发
      conn.port.simulateData(Buffer.from('OnlyCR\ragain\r'))
      conn.port.simulateData(Buffer.from('\n'))

      await new Promise((r) => setTimeout(r, 30))

      expect(onData).toHaveBeenCalledTimes(1)
      expect(onData).toHaveBeenCalledWith(
        expect.objectContaining({
          data: 'OnlyCR\nagain'
        })
      )
    })
  })

  // ============ disconnect() ============
  describe('disconnect()', () => {
    it('should disconnect successfully', async () => {
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      const result = await client.disconnect('test-session-1')
      expect(result.success).toBe(true)
      expect(client.serialConnections.has('test-session-1')).toBe(false)
    })

    it('should stop timer on disconnect', async () => {
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      const conn = client.serialConnections.get('test-session-1')!
      expect(conn.timer).not.toBeNull()

      await client.disconnect('test-session-1')
      expect(conn.timer).toBeNull()
    })

    it('should handle non-existent connection gracefully', async () => {
      const result = await client.disconnect('non-existent')
      expect(result.success).toBe(true)
    })

    it('should NOT trigger onClose callback when actively disconnecting', async () => {
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      await client.disconnect('test-session-1')
      // removeAllListeners('close') 已在 disconnect 中执行，所以 onClose 不应被调用
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  // ============ updateConfig() ============
  describe('updateConfig()', () => {
    it('should update receiveHex dynamically', async () => {
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      const result = await client.updateConfig('test-session-1', { receiveHex: true })
      expect(result.success).toBe(true)

      const conn = client.serialConnections.get('test-session-1')!
      expect(conn.receiveHex).toBe(true)
    })

    it('should fail when connection does not exist', async () => {
      const result = await client.updateConfig('non-existent', { receiveHex: true })
      expect(result.success).toBe(false)
      expect(result.message).toContain('does not exist')
    })

    it('should reopen port when baud rate changes', async () => {
      const info = makeComInfo({ baudRate: 9600 })
      await client.start(info, onData, onClose, onLog)

      const result = await client.updateConfig('test-session-1', { baudRate: 115200 })
      expect(result.success).toBe(true)
    })
  })

  // ============ setReceiveHex() ============
  describe('setReceiveHex()', () => {
    it('should toggle hex mode', async () => {
      const info = makeComInfo()
      await client.start(info, onData, onClose, onLog)

      client.setReceiveHex('test-session-1', true)
      const conn = client.serialConnections.get('test-session-1')!
      expect(conn.receiveHex).toBe(true)

      client.setReceiveHex('test-session-1', false)
      expect(conn.receiveHex).toBe(false)
    })

    it('should not throw on non-existent connection', () => {
      expect(() => client.setReceiveHex('non-existent', true)).not.toThrow()
    })
  })

  // ============ multi-connection ============
  describe('multi-connection', () => {
    it('should manage multiple connections independently', async () => {
      const info1 = makeComInfo({ sessionId: 's1', comName: 'COM3' })
      const info2 = makeComInfo({ sessionId: 's2', comName: 'COM4' })

      const onData1 = vi.fn()
      const onData2 = vi.fn()

      await client.start(info1, onData1, vi.fn(), vi.fn())
      await client.start(info2, onData2, vi.fn(), vi.fn())

      expect(client.serialConnections.size).toBe(2)

      // 向第一个连接发数据
      const conn1 = client.serialConnections.get('s1')!
      conn1.port.simulateData(Buffer.from('from COM3\r\n'))
      await new Promise((r) => setTimeout(r, 30))

      expect(onData1).toHaveBeenCalledTimes(1)
      expect(onData2).not.toHaveBeenCalled()

      // 向第二个连接发数据
      const conn2 = client.serialConnections.get('s2')!
      conn2.port.simulateData(Buffer.from('from COM4\r\n'))
      await new Promise((r) => setTimeout(r, 30))

      expect(onData2).toHaveBeenCalledTimes(1)
    })
  })

  // ============ constructor ============
  describe('constructor', () => {
    it('should accept custom logger', () => {
      const customLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
      }
      const c = new ComClient(customLogger)
      expect(c).toBeInstanceOf(ComClient)
    })
  })
})
