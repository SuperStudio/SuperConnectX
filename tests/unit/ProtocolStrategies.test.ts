/**
 * Protocol Strategies 测试
 * 测试所有协议的 createDefault 和 fromRaw 方法
 */
import { describe, it, expect } from 'vitest'

import { ComStrategy } from '../../src/renderer/src/entity/protocol/com'
import { FtpStrategy } from '../../src/renderer/src/entity/protocol/ftp'
import { TelnetStrategy } from '../../src/renderer/src/entity/protocol/telnet'
import { SshStrategy } from '../../src/renderer/src/entity/protocol/ssh'
import { TcpStrategy } from '../../src/renderer/src/entity/protocol/tcp'
import { UdpStrategy } from '../../src/renderer/src/entity/protocol/udp'
import { HttpStrategy } from '../../src/renderer/src/entity/protocol/http'
import { PingStrategy } from '../../src/renderer/src/entity/protocol/ping'
import { TftpStrategy } from '../../src/renderer/src/entity/protocol/tftp'
import TelnetInfo from '../../src/renderer/src/entity/protocol/TelnetInfo'

// Helper to test a strategy
function testStrategy(
  name: string,
  strategy: { createDefault: () => any; fromRaw: (raw: any) => any },
  defaults: Record<string, any>,
  connectionType: string
) {
  describe(`${name} - createDefault`, () => {
    it(`should create default ${connectionType} connection`, () => {
      const conn = strategy.createDefault()
      expect(conn.connectionType).toBe(connectionType)
      expect(conn.name).toBe('')
    })

    it('should have all expected default fields', () => {
      const conn = strategy.createDefault()
      for (const [key, expectedValue] of Object.entries(defaults)) {
        expect(conn[key]).toBe(expectedValue)
      }
    })
  })

  describe(`${name} - fromRaw`, () => {
    it(`should convert raw to ${connectionType} connection`, () => {
      const raw = {
        id: 1,
        name: 'Test Connection',
        host: '192.168.1.1',
        port: defaults.port || 9999,
        username: 'user',
        password: 'pass'
      }
      const conn = strategy.fromRaw(raw)
      expect(conn.connectionType).toBe(connectionType)
      expect(conn.id).toBe(1)
      expect(conn.name).toBe('Test Connection')
    })

    it('should use defaults for missing fields', () => {
      const conn = strategy.fromRaw({})
      for (const [key, expectedValue] of Object.entries(defaults)) {
        if (key === 'name') continue // name defaults to ''
        if (key === 'host') continue // host defaults to ''
        expect(conn[key]).toBe(expectedValue)
      }
    })

    it('should not modify connectionType from raw', () => {
      const conn = strategy.fromRaw({ connectionType: 'something-else' })
      expect(conn.connectionType).toBe(connectionType)
    })
  })
}

describe('Protocol Strategies', () => {
  // COM Strategy
  testStrategy('ComStrategy', ComStrategy, {
    comName: '',
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    encoding: 'utf8',
    readTimeout: 0,
    writeTimeout: 0,
    flowControl: 'none',
    rts: false,
    dtr: false,
    host: '',
    port: 0,
    username: '',
    password: ''
  }, 'com')

  // FTP Strategy
  testStrategy('FtpStrategy', FtpStrategy, {
    ftpMode: 'server',
    host: '',
    port: 21,
    username: '',
    password: '',
    ftpDirectory: ''
  }, 'ftp')

  // Telnet Strategy
  testStrategy('TelnetStrategy', TelnetStrategy, {
    host: '',
    port: 23,
    username: '',
    password: ''
  }, 'telnet')

  // SSH Strategy
  testStrategy('SshStrategy', SshStrategy, {
    host: '',
    port: 22,
    username: '',
    password: ''
  }, 'ssh')

  // TCP Strategy
  testStrategy('TcpStrategy', TcpStrategy, {
    host: '',
    port: 0
  }, 'tcp')

  // UDP Strategy
  testStrategy('UdpStrategy', UdpStrategy, {
    host: '',
    port: 0
  }, 'udp')

  // HTTP Strategy
  testStrategy('HttpStrategy', HttpStrategy, {
    host: '',
    port: 80,
    username: '',
    password: ''
  }, 'http')

  // Ping Strategy
  testStrategy('PingStrategy', PingStrategy, {
    host: ''
  }, 'ping')

  // TFTP Strategy
  testStrategy('TftpStrategy', TftpStrategy, {
    host: '',
    port: 69,
    username: '',
    password: ''
  }, 'tftp')
})

describe('FtpStrategy - FTP specific', () => {
  it('should have default permissions [get, put, delete, rename]', () => {
    const conn = FtpStrategy.createDefault()
    expect(conn.ftpPermissions).toEqual(['get', 'put', 'delete', 'rename'])
  })

  it('should preserve custom permissions from raw', () => {
    const conn = FtpStrategy.fromRaw({ ftpPermissions: ['get', 'put'] })
    expect(conn.ftpPermissions).toEqual(['get', 'put'])
  })

  it('should use default permissions when raw has none', () => {
    const conn = FtpStrategy.fromRaw({})
    expect(conn.ftpPermissions).toEqual(['get', 'put', 'delete', 'rename'])
  })
})

describe('ComStrategy - COM specific', () => {
  it('should have all serial port fields', () => {
    const conn = ComStrategy.createDefault()
    expect(conn.dataBits).toBe(8)
    expect(conn.stopBits).toBe(1)
    expect(conn.parity).toBe('none')
    expect(conn.flowControl).toBe('none')
    expect(conn.rts).toBe(false)
    expect(conn.dtr).toBe(false)
    expect(conn.readTimeout).toBe(0)
    expect(conn.writeTimeout).toBe(0)
  })

  it('should preserve custom serial settings from raw', () => {
    const conn = ComStrategy.fromRaw({
      baudRate: 115200,
      dataBits: 7,
      parity: 'even',
      flowControl: 'hardware'
    })
    expect(conn.baudRate).toBe(115200)
    expect(conn.dataBits).toBe(7)
    expect(conn.parity).toBe('even')
    expect(conn.flowControl).toBe('hardware')
  })
})

describe('TelnetInfo (deprecated)', () => {
  it('TelnetInfo.build should create default telnet connection', () => {
    const conn = TelnetInfo.build()
    expect(conn.connectionType).toBe('telnet')
    expect(conn.port).toBe(23)
  })

  it('TelnetInfo.buildWithValue should convert raw connection', () => {
    const conn = TelnetInfo.buildWithValue({
      id: 5,
      host: '10.0.0.1',
      port: 2323
    })
    expect(conn.connectionType).toBe('telnet')
    expect(conn.id).toBe(5)
    expect(conn.host).toBe('10.0.0.1')
    expect(conn.port).toBe(2323)
  })

  it('TelnetInfo should export ConnectionFormData type', () => {
    // Type check - just verify the export exists
    expect(TelnetInfo).toBeDefined()
  })
})
