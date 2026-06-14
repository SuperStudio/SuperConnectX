import { describe, it, expect } from 'vitest'
import {
  createDefaultConnection,
  fromRawConnection,
  getProtocolStrategy,
  isTelnetConnection,
  isSshConnection,
  isComConnection,
  isFtpConnection,
  isTcpConnection,
  isUdpConnection,
  isPingConnection,
  isTftpConnection,
  isHttpConnection
} from '../../src/renderer/src/entity/protocol/index'
import type { ConnectionFormData } from '../../src/renderer/src/entity/protocol/base'

describe('Protocol Registry (index.ts)', () => {
  describe('getProtocolStrategy', () => {
    it('获取已注册的协议策略', () => {
      const strategy = getProtocolStrategy('telnet')
      expect(strategy).toBeDefined()
      expect(typeof strategy.createDefault).toBe('function')
      expect(typeof strategy.fromRaw).toBe('function')
    })

    it('所有协议都已注册', () => {
      const protocols = ['telnet', 'ssh', 'com', 'ftp', 'tcp', 'udp', 'ping', 'tftp', 'http']
      for (const type of protocols) {
        expect(() => getProtocolStrategy(type)).not.toThrow()
      }
    })

    it('未注册的协议回退到 telnet', () => {
      const strategy = getProtocolStrategy('unknown')
      expect(strategy).toBeDefined()
      const conn = strategy.createDefault()
      expect(conn.connectionType).toBe('telnet')
    })
  })

  describe('createDefaultConnection', () => {
    it('创建 telnet 默认连接', () => {
      const conn = createDefaultConnection('telnet')
      expect(conn.connectionType).toBe('telnet')
      expect(conn.name).toBe('')
    })

    it('创建 com 默认连接', () => {
      const conn = createDefaultConnection('com')
      expect(conn.connectionType).toBe('com')
    })

    it('未知类型回退到 telnet', () => {
      const conn = createDefaultConnection('unknown')
      expect(conn.connectionType).toBe('telnet')
    })
  })

  describe('fromRawConnection', () => {
    it('从 raw 数据还原连接', () => {
      const raw = {
        connectionType: 'telnet',
        host: '192.168.1.1',
        port: 23,
        name: 'test'
      }
      const conn = fromRawConnection(raw)
      expect(conn.connectionType).toBe('telnet')
      expect(conn.host).toBe('192.168.1.1')
    })

    it('无 connectionType 时默认为 telnet', () => {
      const conn = fromRawConnection({ host: '10.0.0.1' })
      expect(conn.connectionType).toBe('telnet')
    })

    it('空对象默认为 telnet', () => {
      const conn = fromRawConnection({})
      expect(conn.connectionType).toBe('telnet')
    })

    it('null 会抛异常（防御性测试）', () => {
      // fromRaw 中直接访问 raw.id 等属性，传 null 会抛 TypeError
      // 这是预期的，调用方应保证传入对象
      expect(() => fromRawConnection(null as any)).toThrow()
    })
  })

  describe('类型守卫', () => {
    it('isTelnetConnection', () => {
      const conn = createDefaultConnection('telnet')
      expect(isTelnetConnection(conn)).toBe(true)
      expect(isSshConnection(conn)).toBe(false)
    })

    it('isSshConnection', () => {
      const conn = createDefaultConnection('ssh')
      expect(isSshConnection(conn)).toBe(true)
      expect(isTelnetConnection(conn)).toBe(false)
    })

    it('isComConnection', () => {
      const conn = createDefaultConnection('com')
      expect(isComConnection(conn)).toBe(true)
      expect(isFtpConnection(conn)).toBe(false)
    })

    it('isFtpConnection', () => {
      const conn = createDefaultConnection('ftp')
      expect(isFtpConnection(conn)).toBe(true)
      expect(isTcpConnection(conn)).toBe(false)
    })

    it('isTcpConnection', () => {
      const conn = createDefaultConnection('tcp')
      expect(isTcpConnection(conn)).toBe(true)
      expect(isUdpConnection(conn)).toBe(false)
    })

    it('isUdpConnection', () => {
      const conn = createDefaultConnection('udp')
      expect(isUdpConnection(conn)).toBe(true)
    })

    it('isPingConnection', () => {
      const conn = createDefaultConnection('ping')
      expect(isPingConnection(conn)).toBe(true)
    })

    it('isTftpConnection', () => {
      const conn = createDefaultConnection('tftp')
      expect(isTftpConnection(conn)).toBe(true)
    })

    it('isHttpConnection', () => {
      const conn = createDefaultConnection('http')
      expect(isHttpConnection(conn)).toBe(true)
    })

    it('类型守卫对判别联合有效', () => {
      const conn: ConnectionFormData = createDefaultConnection('telnet')
      if (isTelnetConnection(conn)) {
        // TypeScript 应该推断 conn 为 TelnetConnection
        expect(conn.host).toBe('')
        expect(conn.port).toBe(23)
      } else {
        // 不应到达
        expect(false).toBe(true)
      }
    })
  })
})

describe('TelnetInfo (deprecated)', () => {
  it('build 返回 telnet 默认连接', async () => {
    const { default: TelnetInfo } = await import('../../src/renderer/src/entity/protocol/TelnetInfo')
    const conn = TelnetInfo.build()
    expect(conn.connectionType).toBe('telnet')
  })

  it('buildWithValue 从 raw 还原', async () => {
    const { default: TelnetInfo } = await import('../../src/renderer/src/entity/protocol/TelnetInfo')
    const conn = TelnetInfo.buildWithValue({ host: '1.2.3.4', port: 99 })
    expect(conn.connectionType).toBe('telnet')
    expect(conn.host).toBe('1.2.3.4')
    expect(conn.port).toBe(99)
  })
})
