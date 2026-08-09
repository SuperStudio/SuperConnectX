/**
 * ConnectionStateManager 测试
 * 测试连接状态管理的 4 个 Map、清理逻辑、HEX 转换等
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ConnectionStateManager from '../../src/main/ipc/connectors/ConnectionStateManager'

const { mockSend, mockIsDestroyed } = vi.hoisted(() => {
  return {
    mockSend: vi.fn(),
    mockIsDestroyed: vi.fn(() => false)
  }
})

vi.mock('electron', () => ({
  BrowserWindow: class {}
}))

vi.mock('../../src/main/utils/ProtocolLogger', () => ({
  default: class {
    appendToConnLog() {}
    flushConnLog() {}
    createConnLogFile() {}
  }
}))

import ProtocolLogger from '../../src/main/utils/ProtocolLogger'

function createStateManager(
  opts: { mainWindow?: { webContents: { send: Function; isDestroyed: Function } } | null } = {}
): ConnectionStateManager {
  const sm = new ConnectionStateManager()
  sm.init(
    opts.mainWindow !== undefined ? opts : { mainWindow: null },
    new ProtocolLogger() as any
  )
  return sm
}

describe('ConnectionStateManager', () => {
  // ============ Map 操作 ============

  describe('receiveHex', () => {
    it('should default to false', () => {
      const sm = createStateManager()
      expect(sm.getReceiveHex('s1')).toBe(false)
    })

    it('should set and get receiveHex', () => {
      const sm = createStateManager()
      sm.setReceiveHex('s1', true)
      expect(sm.getReceiveHex('s1')).toBe(true)
    })

    it('should handle multiple sessions independently', () => {
      const sm = createStateManager()
      sm.setReceiveHex('s1', true)
      sm.setReceiveHex('s2', false)
      expect(sm.getReceiveHex('s1')).toBe(true)
      expect(sm.getReceiveHex('s2')).toBe(false)
      expect(sm.getReceiveHex('s3')).toBe(false)
    })
  })

  describe('logTimestamp', () => {
    it('should default to true', () => {
      const sm = createStateManager()
      expect(sm.getLogTimestamp('s1')).toBe(true)
    })

    it('should set and get logTimestamp', () => {
      const sm = createStateManager()
      sm.setLogTimestamp('s1', false)
      expect(sm.getLogTimestamp('s1')).toBe(false)
    })
  })

  describe('connectionType', () => {
    it('should return undefined for unknown session', () => {
      const sm = createStateManager()
      expect(sm.getConnectionType('unknown')).toBeUndefined()
    })

    it('should set and get connectionType', () => {
      const sm = createStateManager()
      sm.setConnectionType('s1', 'telnet')
      expect(sm.getConnectionType('s1')).toBe('telnet')
    })
  })

  describe('ftpMode', () => {
    it('should return undefined for unknown session', () => {
      const sm = createStateManager()
      expect(sm.getFtpMode('unknown')).toBeUndefined()
    })

    it('should set and get ftpMode', () => {
      const sm = createStateManager()
      sm.setFtpMode('s1', 'server')
      expect(sm.getFtpMode('s1')).toBe('server')
    })

    it('isFtpServerMode should return true only for server mode', () => {
      const sm = createStateManager()
      sm.setFtpMode('s1', 'server')
      sm.setFtpMode('s2', 'client')
      sm.setFtpMode('s3', '')
      expect(sm.isFtpServerMode('s1')).toBe(true)
      expect(sm.isFtpServerMode('s2')).toBe(false)
      expect(sm.isFtpServerMode('s3')).toBe(false)
      expect(sm.isFtpServerMode('unknown')).toBe(false)
    })
  })

  // ============ cleanupOnClose ============

  describe('cleanupOnClose', () => {
    it('should clear all maps for the session', () => {
      const sm = createStateManager()
      sm.setReceiveHex('s1', true)
      sm.setLogTimestamp('s1', false)
      sm.setConnectionType('s1', 'telnet')
      sm.setFtpMode('s1', 'client')

      sm.cleanupOnClose('s1')

      expect(sm.getReceiveHex('s1')).toBe(false)    // default
      expect(sm.getLogTimestamp('s1')).toBe(true)    // default
      expect(sm.getConnectionType('s1')).toBeUndefined()
      expect(sm.getFtpMode('s1')).toBeUndefined()
    })

    it('should not affect other sessions', () => {
      const sm = createStateManager()
      sm.setConnectionType('s1', 'telnet')
      sm.setConnectionType('s2', 'com')

      sm.cleanupOnClose('s1')

      expect(sm.getConnectionType('s1')).toBeUndefined()
      expect(sm.getConnectionType('s2')).toBe('com')
    })

    it('should send on-connect-close when window exists', () => {
      const send = vi.fn()
      const sm = createStateManager({
        mainWindow: { webContents: { send, isDestroyed: () => false } }
      })

      sm.cleanupOnClose('s1')
      expect(send).toHaveBeenCalledWith('on-connect-close', 's1')
    })

    it('should NOT send when window is null', () => {
      const sm = createStateManager({ mainWindow: null })
      // should not throw
      expect(() => sm.cleanupOnClose('s1')).not.toThrow()
    })

    it('should NOT send when webContents is destroyed', () => {
      const send = vi.fn()
      const sm = createStateManager({
        mainWindow: { webContents: { send, isDestroyed: () => true } }
      })

      sm.cleanupOnClose('s1')
      expect(send).not.toHaveBeenCalled()
    })

    it('should call logger.flushConnLog', () => {
      const flushConnLog = vi.fn()
      const mockLogger = { flushConnLog } as any
      const sm = new ConnectionStateManager()
      sm.init({ mainWindow: null }, mockLogger)

      sm.cleanupOnClose('s1')
      expect(flushConnLog).toHaveBeenCalledWith('s1')
    })
  })

  // ============ buildLogContent ============

  describe('buildLogContent', () => {
    it('should prepend timestamp when logTimestamp is true', () => {
      const sm = createStateManager()
      sm.setLogTimestamp('s1', true)
      expect(sm.buildLogContent('s1', 'hello', '12:00:00')).toBe('[12:00:00] hello')
    })

    it('should NOT prepend timestamp when logTimestamp is false', () => {
      const sm = createStateManager()
      sm.setLogTimestamp('s1', false)
      expect(sm.buildLogContent('s1', 'hello', '12:00:00')).toBe('hello')
    })

    it('should return raw logStr when timestamp is empty', () => {
      const sm = createStateManager()
      expect(sm.buildLogContent('s1', 'hello', '')).toBe('hello')
    })

    it('should default logTimestamp to true', () => {
      const sm = createStateManager()
      expect(sm.buildLogContent('s1', 'hello', '12:00:00')).toBe('[12:00:00] hello')
    })
  })

  // ============ sendDataToRenderer ============

  describe('sendDataToRenderer', () => {
    it('should send on-recv-data to renderer', () => {
      const send = vi.fn()
      const sm = createStateManager({
        mainWindow: { webContents: { send, isDestroyed: () => false } }
      })

      sm.sendDataToRenderer('s1', 'data123', '12:00:00', false)

      expect(send).toHaveBeenCalledWith('on-recv-data', {
        connId: 's1',
        data: 'data123',
        timestamp: '12:00:00',
        isHex: false
      })
    })

    it('should not throw when window is null', () => {
      const sm = createStateManager({ mainWindow: null })
      expect(() => sm.sendDataToRenderer('s1', 'data', 't', false)).not.toThrow()
    })

    it('should skip when webContents is destroyed', () => {
      const send = vi.fn()
      const sm = createStateManager({
        mainWindow: { webContents: { send, isDestroyed: () => true } }
      })
      sm.sendDataToRenderer('s1', 'data', 't', false)
      expect(send).not.toHaveBeenCalled()
    })
  })

  // convertToHex 已从 ConnectionStateManager 中移除
  // HEX 转换逻辑已下沉到 BufferLineSplitter.decodeBuffer() 中完成
})
