/**
 * BaseClient 测试
 * 测试抽象基类的构造函数、默认 logger 行为、stub 方法
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 不直接 import BaseClient，因为其依赖链会触发 electron 和 IpcAppLogger
// 改为独立测试 BaseClient 的核心逻辑

describe('BaseClient', () => {
  let BaseClient: any

  beforeEach(async () => {
    // 动态导入，使用 mock alias
    const mod = await import('../../src/main/protocol/BaseClient')
    BaseClient = mod.default
  })

  describe('constructor and logger', () => {
    it('should use provided logger when passed', () => {
      const customLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
      const client = new BaseClient(customLogger)
      expect(client.logger).toBe(customLogger)
    })

    it('should use default logger when no logger provided', () => {
      const client = new BaseClient()
      expect(client.logger).toBeDefined()
      expect(typeof client.logger.info).toBe('function')
      expect(typeof client.logger.warn).toBe('function')
      expect(typeof client.logger.error).toBe('function')
      expect(typeof client.logger.debug).toBe('function')
    })

    it('should fallback to console in worker environment', () => {
      // 默认 logger 应该是 console（因为在测试环境 IpcAppLogger mock 存在）
      const client = new BaseClient()
      // 测试环境的 mock 返回有效 logger
      expect(client.logger).toBeDefined()
    })
  })

  describe('ILogger interface compatibility', () => {
    it('should accept console as logger', () => {
      const client = new BaseClient(console)
      expect(client.logger).toBe(console)
    })

    it('should accept object with debug/info/warn/error', () => {
      const obj = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
      const client = new BaseClient(obj)
      expect(client.logger).toBe(obj)
    })
  })

  describe('start()', () => {
    it('should return not implemented by default', async () => {
      const client = new BaseClient()
      const result = await client.start({} as any, null, null)
      expect(result).toEqual({ success: false, message: 'Not implemented' })
    })

    it('should accept all callback parameters', async () => {
      const client = new BaseClient()
      const onData = vi.fn()
      const onClose = vi.fn()
      const onLog = vi.fn()
      const result = await client.start({ sessionId: 'test' } as any, onData, onClose, onLog)
      expect(result.success).toBe(false)
    })
  })

  describe('send()', () => {
    it('should return not implemented by default', async () => {
      const client = new BaseClient()
      const result = await client.send('conn1', 'test', null)
      expect(result).toEqual({ success: false, message: 'Not implemented' })
    })

    it('should accept onComplete callback', async () => {
      const client = new BaseClient()
      const onComplete = vi.fn()
      const result = await client.send('conn1', 'hello', onComplete)
      expect(result.success).toBe(false)
    })
  })

  describe('disconnect()', () => {
    it('should return not implemented by default', async () => {
      const client = new BaseClient()
      const result = await client.disconnect('conn1')
      expect(result).toEqual({ success: false, message: 'Not implemented' })
    })
  })

  describe('updateConfig()', () => {
    it('should return not implemented by default', async () => {
      const client = new BaseClient()
      const result = await client.updateConfig('conn1', { baudRate: 115200 })
      expect(result).toEqual({ success: false, message: 'Not implemented' })
    })

    it('should accept various config shapes', async () => {
      const client = new BaseClient()
      const result1 = await client.updateConfig('conn1', {})
      expect(result1.success).toBe(false)

      const result2 = await client.updateConfig('conn1', { receiveHex: true })
      expect(result2.success).toBe(false)
    })
  })

  describe('setReceiveHex()', () => {
    it('should not throw with any arguments', () => {
      const client = new BaseClient()
      expect(() => client.setReceiveHex('conn1', true)).not.toThrow()
      expect(() => client.setReceiveHex('conn1', false)).not.toThrow()
      expect(() => client.setReceiveHex('', true)).not.toThrow()
    })
  })
})
