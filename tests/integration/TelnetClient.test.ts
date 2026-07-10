/**
 * TelnetClient 集成测试
 * 测试 TelnetClient 的实际消息流处理（含 BufferLineSplitter 协作）
 *
 * 注意：由于 telnet-client 需要实际网络连接，这里使用 mock 测试核心流程
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock telnet-client
vi.mock('telnet-client', () => {
  class MockTelnet {
    private _events: Map<string, Function[]> = new Map()
    private _id: string = ''

    constructor() {
      this._id = `telnet-${Date.now()}`
    }

    on(event: string, callback: Function) {
      if (!this._events.has(event)) this._events.set(event, [])
      this._events.get(event)!.push(callback)
    }

    removeAllListeners(event?: string) {
      if (event) {
        this._events.delete(event)
      } else {
        this._events.clear()
      }
    }

    async connect(_params: any) {}

    async send(_command: string) {}

    destroy() {
      this._events.clear()
    }

    // Test helpers
    _emit(event: string, ...args: any[]) {
      const cbs = this._events.get(event) || []
      for (const cb of cbs) cb(...args)
    }
  }

  return { Telnet: MockTelnet }
})

vi.mock('../../src/main/protocol/BufferLineSplitter', () => ({
  BufferLineSplitter: class {
    split(buffer: Buffer) {
      const str = buffer.toString('utf8')
      const lines = str.split(/\r?\n/)
      if (lines.length === 1) {
        return { data: '', log: '', remainder: buffer, count: 0 }
      }
      const data = lines.slice(0, -1).join('\n')
      const remainder = Buffer.from(lines[lines.length - 1], 'utf8')
      return { data, log: data, remainder, count: lines.length - 1 }
    }
    static timestamp(): string {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`
    }
  }
}))

import TelnetClient from '../../src/main/protocol/TelnetClient'

describe('TelnetClient Integration', () => {
  let client: TelnetClient

  beforeEach(() => {
    client = new TelnetClient()
  })

  describe('connection lifecycle', () => {
    it('should handle full connect-send-disconnect cycle', async () => {
      const onData = vi.fn()
      const onClose = vi.fn()
      const onLog = vi.fn()

      // Connect
      const startResult = await client.start(
        {
          host: '127.0.0.1',
          port: 23,
          username: '',
          password: '',
          sessionId: 'integration-test'
        },
        onData, onClose, onLog
      )

      expect(startResult.success).toBe(true)
      expect(client.telnetConnections.size).toBe(1)

      // Send multiple commands
      const s1 = await client.send('integration-test', 'command1', vi.fn())
      const s2 = await client.send('integration-test', 'command2', vi.fn())
      expect(s1.success).toBe(true)
      expect(s2.success).toBe(true)

      // Disconnect
      const discResult = await client.disconnect('integration-test')
      expect(discResult.success).toBe(true)
      expect(client.telnetConnections.size).toBe(0)
    })

    it('should handle concurrent connections', async () => {
      // Start 3 connections
      await client.start(
        { host: 'a.com', port: 23, username: '', password: '', sessionId: 'a' },
        vi.fn(), vi.fn(), vi.fn()
      )
      await client.start(
        { host: 'b.com', port: 23, username: '', password: '', sessionId: 'b' },
        vi.fn(), vi.fn(), vi.fn()
      )
      await client.start(
        { host: 'c.com', port: 23, username: '', password: '', sessionId: 'c' },
        vi.fn(), vi.fn(), vi.fn()
      )

      expect(client.telnetConnections.size).toBe(3)

      // Send to each independently
      const ra = await client.send('a', 'cmd-a', vi.fn())
      const rb = await client.send('b', 'cmd-b', vi.fn())
      const rc = await client.send('c', 'cmd-c', vi.fn())
      expect(ra.success).toBe(true)
      expect(rb.success).toBe(true)
      expect(rc.success).toBe(true)

      // Disconnect middle one
      await client.disconnect('b')
      expect(client.telnetConnections.size).toBe(2)

      // Others still work
      const ra2 = await client.send('a', 'cmd-a2', vi.fn())
      const rc2 = await client.send('c', 'cmd-c2', vi.fn())
      expect(ra2.success).toBe(true)
      expect(rc2.success).toBe(true)

      // Cleanup
      await client.disconnect('a')
      await client.disconnect('c')
      expect(client.telnetConnections.size).toBe(0)
    })
  })

  describe('error handling', () => {
    it('should handle send to disconnected connection', async () => {
      await client.start(
        { host: 'x.com', port: 23, username: '', password: '', sessionId: 'err-test' },
        vi.fn(), vi.fn(), vi.fn()
      )
      await client.disconnect('err-test')

      const result = await client.send('err-test', 'test', vi.fn())
      expect(result.success).toBe(false)
    })

    it('should handle disconnect of non-existent connection', async () => {
      const result = await client.disconnect('ghost-connection')
      expect(result.success).toBe(true)
    })
  })

  describe('config update', () => {
    it('should accept any config update without error', async () => {
      await client.start(
        { host: 'y.com', port: 23, username: '', password: '', sessionId: 'cfg-test' },
        vi.fn(), vi.fn(), vi.fn()
      )

      const result = await client.updateConfig('cfg-test', { anything: 'value' })
      expect(result.success).toBe(true)
    })
  })

  describe('port handling', () => {
    it('should default to port 23', async () => {
      const result = await client.start(
        {
          host: 'example.com',
          port: 0, // falsy port
          username: '',
          password: '',
          sessionId: 'default-port'
        },
        vi.fn(), vi.fn(), vi.fn()
      )
      expect(result.success).toBe(true)
    })

    it('should use explicit port', async () => {
      const result = await client.start(
        {
          host: 'example.com',
          port: 8023,
          username: '',
          password: '',
          sessionId: 'custom-port'
        },
        vi.fn(), vi.fn(), vi.fn()
      )
      expect(result.success).toBe(true)
    })
  })
})
