/**
 * IpcDataCheck 测试
 * 测试数据校验 IPC handler 注册
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockHandlers } = vi.hoisted(() => {
  const handlers = new Map<string, Function>()
  return { mockHandlers: handlers }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle(channel: string, handler: Function) {
      mockHandlers.set(channel, handler)
    }
  }
}))

vi.mock('../../src/main/ipc/IpcAppLogger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import IpcDataCheck from '../../src/main/ipc/IpcDataCheck'

describe('IpcDataCheck', () => {
  beforeEach(() => {
    mockHandlers.clear()
  })

  describe('singleton', () => {
    it('should have getInstance method', () => {
      const instance = IpcDataCheck.getInstance()
      expect(instance).toBeDefined()
    })

    it('should return same instance', () => {
      expect(IpcDataCheck.getInstance()).toBe(IpcDataCheck.getInstance())
    })

    it('should have init method', () => {
      const instance = IpcDataCheck.getInstance()
      expect(typeof instance.init).toBe('function')
    })

    it('init should not throw', () => {
      const instance = IpcDataCheck.getInstance()
      expect(() => instance.init()).not.toThrow()
    })
  })

  describe('init() - handler registration', () => {
    it('should register datacheck:getPlugins handler', () => {
      const instance = IpcDataCheck.getInstance()
      instance.init()
      expect(mockHandlers.has('datacheck:getPlugins')).toBe(true)
    })

    it('should register datacheck:checkData handler', () => {
      const instance = IpcDataCheck.getInstance()
      instance.init()
      expect(mockHandlers.has('datacheck:checkData')).toBe(true)
    })
  })

  describe('getPlugins handler', () => {
    it('should return non-empty array of plugins', async () => {
      const instance = IpcDataCheck.getInstance()
      instance.init()
      const handler = mockHandlers.get('datacheck:getPlugins')
      expect(handler).toBeDefined()

      const result = await handler!()
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
      // Each plugin should have name and type
      for (const plugin of result) {
        expect(plugin).toHaveProperty('name')
        expect(plugin).toHaveProperty('type')
      }
    })

    it('should include CRC algorithms', async () => {
      const instance = IpcDataCheck.getInstance()
      instance.init()
      const handler = mockHandlers.get('datacheck:getPlugins')!
      const result = await handler()
      const crcPlugins = result.filter((p: any) => p.type === 'crc')
      expect(crcPlugins.length).toBeGreaterThan(0)
    })

    it('should include non-CRC algorithms (BCC, LRC, checksum)', async () => {
      const instance = IpcDataCheck.getInstance()
      instance.init()
      const handler = mockHandlers.get('datacheck:getPlugins')!
      const result = await handler()
      const nativePlugins = result.filter((p: any) => p.type === 'native')
      expect(nativePlugins.length).toBeGreaterThan(0)
    })
  })

  describe('checkData handler', () => {
    it('should return result for valid algorithm and hex data', async () => {
      const instance = IpcDataCheck.getInstance()
      instance.init()
      const handler = mockHandlers.get('datacheck:checkData')!
      // The handler takes (_event, pluginName, hexData) - 2 string args after event
      const result = await handler({}, 'CRC-16/MODBUS', '0103')
      expect(result).toHaveProperty('hexResult')
      expect(result).toHaveProperty('details')
    })

    it('should return hexResult as string', async () => {
      const instance = IpcDataCheck.getInstance()
      instance.init()
      const handler = mockHandlers.get('datacheck:checkData')!
      const result = await handler({}, 'CRC-16/MODBUS', '0103')
      expect(typeof result.hexResult).toBe('string')
    })

    it('should return details array', async () => {
      const instance = IpcDataCheck.getInstance()
      instance.init()
      const handler = mockHandlers.get('datacheck:checkData')!
      const result = await handler({}, 'BCC(异或校验)', '010203')
      expect(Array.isArray(result.details)).toBe(true)
      expect(result.details.length).toBeGreaterThan(0)
    })

    it('should handle empty hex data', async () => {
      const instance = IpcDataCheck.getInstance()
      instance.init()
      const handler = mockHandlers.get('datacheck:checkData')!
      const result = await handler({}, 'BCC(异或校验)', '')
      expect(result).toHaveProperty('hexResult')
    })
  })
})
