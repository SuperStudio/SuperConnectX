/**
 * TelnetClient 测试
 * 使用 mock 的 telnet-client 库测试 TelnetClient 核心逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock telnet-client
vi.mock('telnet-client', () => {
  class MockTelnet {
    private listeners: Map<string, Function[]> = new Map()

    on(event: string, callback: Function): void {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, [])
      }
      this.listeners.get(event)!.push(callback)
    }

    removeAllListeners(event?: string): void {
      if (event) {
        this.listeners.delete(event)
      } else {
        this.listeners.clear()
      }
    }

    async connect(_params: any): Promise<void> {
      // simulate successful connection
    }

    async send(_command: string): Promise<void> {
      // simulate send
    }

    destroy(): void {
      // simulate destroy
    }

    // Helper for tests
    emit(event: string, ...args: any[]): void {
      const cbs = this.listeners.get(event) || []
      cbs.forEach(cb => cb(...args))
    }
  }

  return { Telnet: MockTelnet }
})

// Mock BufferLineSplitter
vi.mock('../../src/main/protocol/BufferLineSplitter', () => ({
  BufferLineSplitter: class {
    private encoding: string
    private receiveHex: boolean

    constructor(encoding = 'utf8', receiveHex = false) {
      this.encoding = encoding
      this.receiveHex = receiveHex
    }

    split(buffer: Buffer) {
      const str = buffer.toString(this.encoding)
      const lines = str.split(/\r?\n/)
      if (lines.length === 1) {
        return { data: '', log: '', remainder: buffer, count: 0 }
      }
      const data = lines.slice(0, -1).join('\n')
      const remainder = Buffer.from(lines[lines.length - 1], this.encoding)
      const log = this.receiveHex ? this.toHexLog(data) : data
      return { data, log, remainder, count: lines.length - 1 }
    }

    private toHexLog(data: string): string {
      let result = ''
      for (let i = 0; i < data.length; i++) {
        const hex = data.charCodeAt(i).toString(16)
        result += hex.padStart(2, '0') + ' '
      }
      return result.trim()
    }

    static timestamp(): string {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`
    }
  }
}))

import TelnetClient from '../../src/main/protocol/TelnetClient'

describe('TelnetClient', () => {
  let client: TelnetClient

  beforeEach(() => {
    client = new TelnetClient()
  })

  describe('constructor', () => {
    it('should create instance with default logger', () => {
      expect(client).toBeDefined()
      expect(client.telnetConnections).toBeDefined()
      expect(client.connectionInfos).toBeDefined()
      expect(client.telnetConnectionData).toBeDefined()
    })

    it('should create instance with custom logger', () => {
      const customLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
      const c = new TelnetClient(customLogger)
      expect(c).toBeDefined()
    })

    it('should have empty maps initially', () => {
      expect(client.telnetConnections.size).toBe(0)
      expect(client.connectionInfos.size).toBe(0)
      expect(client.telnetConnectionData.size).toBe(0)
    })
  })

  describe('start()', () => {
    const makeInfo = (overrides: any = {}) => ({
      host: '192.168.1.1',
      port: 23,
      username: '',
      password: '',
      sessionId: 'telnet-1',
      ...overrides
    })

    it('should return success on connection', async () => {
      const onData = vi.fn()
      const onClose = vi.fn()
      const onLog = vi.fn()

      const result = await client.start(makeInfo(), onData, onClose, onLog)

      expect(result.success).toBe(true)
      expect(result.message).toBe('Connected successfully')
      expect(result.connId).toBe('telnet-1')
      expect(client.telnetConnections.has('telnet-1')).toBe(true)
    })

    it('should use default port 23 when port not provided', async () => {
      const info = makeInfo({ port: undefined })
      const result = await client.start(info, vi.fn(), vi.fn(), vi.fn())
      expect(result.success).toBe(true)
    })

    it('should use provided port', async () => {
      const info = makeInfo({ port: 2323 })
      const result = await client.start(info, vi.fn(), vi.fn(), vi.fn())
      expect(result.success).toBe(true)
    })

    it('should store connection info', async () => {
      const info = makeInfo()
      await client.start(info, vi.fn(), vi.fn(), vi.fn())

      const storedInfo = client.connectionInfos.get('telnet-1')
      expect(storedInfo).toBeDefined()
      expect(storedInfo!.host).toBe('192.168.1.1')
      expect(storedInfo!.port).toBe(23)
    })

    it('should store connection data with splitter', async () => {
      const info = makeInfo()
      await client.start(info, vi.fn(), vi.fn(), vi.fn())

      const connData = client.telnetConnectionData.get('telnet-1')
      expect(connData).toBeDefined()
      expect(connData!.splitter).toBeDefined()
      expect(connData!.buffer).toBeDefined()
    })

    it('should support multiple connections', async () => {
      await client.start(makeInfo({ sessionId: 't1' }), vi.fn(), vi.fn(), vi.fn())
      await client.start(makeInfo({ sessionId: 't2', host: '10.0.0.1' }), vi.fn(), vi.fn(), vi.fn())

      expect(client.telnetConnections.size).toBe(2)
      expect(client.telnetConnectionData.size).toBe(2)
    })

    it('should handle connection failure gracefully', async () => {
      // Force connect to fail by mocking
      const { Telnet: MockTelnet } = await import('telnet-client')
      const origConnect = MockTelnet.prototype.connect
      MockTelnet.prototype.connect = vi.fn().mockRejectedValue(new Error('Connection refused'))

      const result = await client.start(makeInfo({ sessionId: 'fail-1' }), vi.fn(), vi.fn(), vi.fn())
      expect(result.success).toBe(false)
      expect(result.message).toContain('Connection refused')

      MockTelnet.prototype.connect = origConnect
    })
  })

  describe('send()', () => {
    it('should send command successfully', async () => {
      await client.start(
        { host: '1.2.3.4', port: 23, username: '', password: '', sessionId: 'send-1' },
        vi.fn(), vi.fn(), vi.fn()
      )

      const onComplete = vi.fn()
      const result = await client.send('send-1', 'ls -la', onComplete)

      expect(result.success).toBe(true)
      expect(onComplete).toHaveBeenCalled()
      const dataStr = onComplete.mock.calls[0][0]
      expect(dataStr).toContain('SEND >>>>>>>>>>')
      expect(dataStr).toContain('ls -la')
    })

    it('should fail when connection does not exist', async () => {
      const result = await client.send('nonexistent', 'test', vi.fn())
      expect(result.success).toBe(false)
      expect(result.message).toBe('Connection does not exist')
    })

    it('should support multiple sends', async () => {
      await client.start(
        { host: '1.2.3.4', port: 23, username: '', password: '', sessionId: 'multi' },
        vi.fn(), vi.fn(), vi.fn()
      )

      const r1 = await client.send('multi', 'cmd1', vi.fn())
      const r2 = await client.send('multi', 'cmd2', vi.fn())
      const r3 = await client.send('multi', 'cmd3', vi.fn())

      expect(r1.success).toBe(true)
      expect(r2.success).toBe(true)
      expect(r3.success).toBe(true)
    })
  })

  describe('disconnect()', () => {
    it('should disconnect existing connection', async () => {
      await client.start(
        { host: '1.2.3.4', port: 23, username: '', password: '', sessionId: 'disc-1' },
        vi.fn(), vi.fn(), vi.fn()
      )

      const result = await client.disconnect('disc-1')
      expect(result.success).toBe(true)
      expect(client.telnetConnections.has('disc-1')).toBe(false)
      expect(client.connectionInfos.has('disc-1')).toBe(false)
      expect(client.telnetConnectionData.has('disc-1')).toBe(false)
    })

    it('should return success for non-existent connection', async () => {
      const result = await client.disconnect('nonexistent')
      expect(result.success).toBe(true)
    })

    it('should clean up all maps on disconnect', async () => {
      await client.start(
        { host: '1.2.3.4', port: 23, username: '', password: '', sessionId: 'clean-1' },
        vi.fn(), vi.fn(), vi.fn()
      )

      await client.disconnect('clean-1')

      expect(client.telnetConnections.size).toBe(0)
      expect(client.connectionInfos.size).toBe(0)
      expect(client.telnetConnectionData.size).toBe(0)
    })

    it('should handle disconnect of already disconnected', async () => {
      await client.start(
        { host: '1.2.3.4', port: 23, username: '', password: '', sessionId: 'd1' },
        vi.fn(), vi.fn(), vi.fn()
      )
      await client.disconnect('d1')
      const r2 = await client.disconnect('d1')
      expect(r2.success).toBe(true)
    })
  })

  describe('updateConfig()', () => {
    it('should return success with message for any config', async () => {
      await client.start(
        { host: '1.2.3.4', port: 23, username: '', password: '', sessionId: 'cfg-1' },
        vi.fn(), vi.fn(), vi.fn()
      )

      const result = await client.updateConfig('cfg-1', { receiveHex: true })
      expect(result.success).toBe(true)
      expect(result.message).toContain('No config to update')
    })

    it('should work for non-existent connection', async () => {
      const result = await client.updateConfig('none', { someConfig: true })
      expect(result.success).toBe(true)
    })
  })

  describe('lifecycle', () => {
    it('should handle start -> send -> disconnect flow', async () => {
      const onData = vi.fn()
      const onClose = vi.fn()
      const onLog = vi.fn()

      // Start
      const startResult = await client.start(
        { host: '1.2.3.4', port: 23, username: '', password: '', sessionId: 'life' },
        onData, onClose, onLog
      )
      expect(startResult.success).toBe(true)

      // Send
      const sendResult = await client.send('life', 'hello', vi.fn())
      expect(sendResult.success).toBe(true)

      // Disconnect
      const discResult = await client.disconnect('life')
      expect(discResult.success).toBe(true)
    })

    it('should handle concurrent connections independently', async () => {
      const d1 = vi.fn(), c1 = vi.fn(), l1 = vi.fn()
      const d2 = vi.fn(), c2 = vi.fn(), l2 = vi.fn()

      await client.start(
        { host: '1.1.1.1', port: 23, username: '', password: '', sessionId: 'connA' },
        d1, c1, l1
      )
      await client.start(
        { host: '2.2.2.2', port: 2323, username: '', password: '', sessionId: 'connB' },
        d2, c2, l2
      )

      expect(client.telnetConnections.size).toBe(2)

      // Disconnect only one
      await client.disconnect('connA')
      expect(client.telnetConnections.has('connA')).toBe(false)
      expect(client.telnetConnections.has('connB')).toBe(true)

      // The other still works
      const sendResult = await client.send('connB', 'test', vi.fn())
      expect(sendResult.success).toBe(true)
    })
  })
})
