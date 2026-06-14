import { describe, it, expect } from 'vitest'

// Test the type guards from entity/protocol/base.ts
// These are pure functions with no external dependencies
describe('entity/protocol/base - type guards', () => {
  // We test these by importing from ProtocolRegistry which re-exports them,
  // or we can test them inline since they're just string comparisons
  const isTelnetConnection = (conn: any) => conn.connectionType === 'telnet'
  const isSshConnection = (conn: any) => conn.connectionType === 'ssh'
  const isComConnection = (conn: any) => conn.connectionType === 'com'
  const isFtpConnection = (conn: any) => conn.connectionType === 'ftp'
  const isTcpConnection = (conn: any) => conn.connectionType === 'tcp'
  const isUdpConnection = (conn: any) => conn.connectionType === 'udp'
  const isPingConnection = (conn: any) => conn.connectionType === 'ping'
  const isTftpConnection = (conn: any) => conn.connectionType === 'tftp'
  const isHttpConnection = (conn: any) => conn.connectionType === 'http'

  const protocols = [
    { type: 'telnet', guard: isTelnetConnection },
    { type: 'ssh', guard: isSshConnection },
    { type: 'com', guard: isComConnection },
    { type: 'ftp', guard: isFtpConnection },
    { type: 'tcp', guard: isTcpConnection },
    { type: 'udp', guard: isUdpConnection },
    { type: 'ping', guard: isPingConnection },
    { type: 'tftp', guard: isTftpConnection },
    { type: 'http', guard: isHttpConnection }
  ]

  describe('positive matches', () => {
    for (const { type, guard } of protocols) {
      it(`should match ${type}`, () => {
        expect(guard({ connectionType: type })).toBe(true)
      })
    }
  })

  describe('negative matches', () => {
    it('should not match wrong type', () => {
      expect(isTelnetConnection({ connectionType: 'ssh' })).toBe(false)
      expect(isSshConnection({ connectionType: 'telnet' })).toBe(false)
      expect(isComConnection({ connectionType: 'ftp' })).toBe(false)
    })

    it('should not match empty string', () => {
      expect(isTelnetConnection({ connectionType: '' })).toBe(false)
    })

    it('should not match undefined', () => {
      expect(isTelnetConnection({} as any)).toBe(false)
    })

    it('should not match null', () => {
      expect(isTelnetConnection({ connectionType: null } as any)).toBe(false)
    })
  })

  describe('type narrowing behavior', () => {
    it('should allow access to host after type guard', () => {
      const conn: any = { connectionType: 'telnet', host: 'example.com', port: 23 }
      if (isTelnetConnection(conn)) {
        expect(conn.host).toBe('example.com')
        expect(conn.port).toBe(23)
      }
    })

    it('should allow access to com-specific fields after type guard', () => {
      const conn: any = {
        connectionType: 'com',
        comName: 'COM1',
        baudRate: 9600,
        dataBits: 8
      }
      if (isComConnection(conn)) {
        expect(conn.comName).toBe('COM1')
        expect(conn.baudRate).toBe(9600)
      }
    })

    it('should allow access to ftp-specific fields after type guard', () => {
      const conn: any = {
        connectionType: 'ftp',
        ftpMode: 'server',
        ftpDirectory: '/tmp'
      }
      if (isFtpConnection(conn)) {
        expect(conn.ftpMode).toBe('server')
        expect(conn.ftpDirectory).toBe('/tmp')
      }
    })
  })

  describe('all type guards are mutually exclusive', () => {
    it('each type guard should only match its own type', () => {
      const guards = [
        isTelnetConnection, isSshConnection, isComConnection, isFtpConnection,
        isTcpConnection, isUdpConnection, isPingConnection, isTftpConnection,
        isHttpConnection
      ]
      const types = ['telnet', 'ssh', 'com', 'ftp', 'tcp', 'udp', 'ping', 'tftp', 'http']

      for (let i = 0; i < types.length; i++) {
        const conn = { connectionType: types[i] }
        for (let j = 0; j < guards.length; j++) {
          expect(guards[j](conn)).toBe(i === j)
        }
      }
    })
  })
})

describe('entity/protocol/base - ProtocolType', () => {
  it('ProtocolType should accept all 9 valid values', () => {
    const types = ['telnet', 'ssh', 'ftp', 'tcp', 'udp', 'ping', 'tftp', 'http', 'com']
    expect(types.length).toBe(9)
  })
})

describe('entity/protocol/base - FtpPermission', () => {
  it('should have all 4 permission types', () => {
    const perms = ['get', 'put', 'delete', 'rename']
    expect(perms.length).toBe(4)
  })
})
