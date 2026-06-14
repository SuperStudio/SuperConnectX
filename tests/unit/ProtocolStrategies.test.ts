import { describe, it, expect } from 'vitest'
import { TelnetStrategy } from '../../src/renderer/src/entity/protocol/telnet'
import { SshStrategy } from '../../src/renderer/src/entity/protocol/ssh'
import { ComStrategy } from '../../src/renderer/src/entity/protocol/com'
import { FtpStrategy } from '../../src/renderer/src/entity/protocol/ftp'
import { TcpStrategy } from '../../src/renderer/src/entity/protocol/tcp'
import { UdpStrategy } from '../../src/renderer/src/entity/protocol/udp'
import { PingStrategy } from '../../src/renderer/src/entity/protocol/ping'
import { TftpStrategy } from '../../src/renderer/src/entity/protocol/tftp'
import { HttpStrategy } from '../../src/renderer/src/entity/protocol/http'

describe('Protocol Strategies', () => {
  const allStrategies = [
    { name: 'Telnet', strategy: TelnetStrategy, type: 'telnet', defaultPort: 23 },
    { name: 'Ssh', strategy: SshStrategy, type: 'ssh', defaultPort: 22 },
    { name: 'Com', strategy: ComStrategy, type: 'com', defaultPort: 0 },
    { name: 'Ftp', strategy: FtpStrategy, type: 'ftp', defaultPort: 21 },
    { name: 'Tcp', strategy: TcpStrategy, type: 'tcp', defaultPort: 0 },
    { name: 'Udp', strategy: UdpStrategy, type: 'udp', defaultPort: 0 },
    { name: 'Ping', strategy: PingStrategy, type: 'ping', defaultPort: undefined },
    { name: 'Tftp', strategy: TftpStrategy, type: 'tftp', defaultPort: 69 },
    { name: 'Http', strategy: HttpStrategy, type: 'http', defaultPort: 80 }
  ]

  describe('createDefault', () => {
    for (const { name, strategy, type, defaultPort } of allStrategies) {
      it(`${name}: 返回正确的 connectionType`, () => {
        const conn = strategy.createDefault()
        expect(conn.connectionType).toBe(type)
      })

      it(`${name}: 返回空名称`, () => {
        const conn = strategy.createDefault()
        expect(conn.name).toBe('')
      })

      if (defaultPort !== undefined) {
        it(`${name}: 默认端口 = ${defaultPort}`, () => {
          const conn = strategy.createDefault() as any
          expect(conn.port).toBe(defaultPort)
        })
      }

      it(`${name}: 没有 id 字段（新建连接）`, () => {
        const conn = strategy.createDefault()
        expect((conn as any).id).toBeUndefined()
      })
    }

    it('Com: 包含所有串口字段', () => {
      const conn = ComStrategy.createDefault()
      expect(conn.comName).toBe('')
      expect(conn.baudRate).toBe(9600)
      expect(conn.dataBits).toBe(8)
      expect(conn.stopBits).toBe(1)
      expect(conn.parity).toBe('none')
      expect(conn.encoding).toBe('utf8')
      expect(conn.flowControl).toBe('none')
      expect(conn.rts).toBe(false)
      expect(conn.dtr).toBe(false)
    })

    it('Ftp: 默认 ftpMode 为 server', () => {
      const conn = FtpStrategy.createDefault()
      expect(conn.ftpMode).toBe('server')
    })

    it('Ftp: 默认 ftpPermissions 包含全部权限', () => {
      const conn = FtpStrategy.createDefault()
      expect(conn.ftpPermissions).toEqual(['get', 'put', 'delete', 'rename'])
    })

    it('Ping: 没有 port 字段', () => {
      const conn = PingStrategy.createDefault()
      expect((conn as any).port).toBeUndefined()
    })

    it('Ping: 没有 username/password', () => {
      const conn = PingStrategy.createDefault()
      expect((conn as any).username).toBeUndefined()
      expect((conn as any).password).toBeUndefined()
    })

    it('Tcp/Udp: 没有 username/password', () => {
      const tcp = TcpStrategy.createDefault()
      expect((tcp as any).username).toBeUndefined()
      expect((tcp as any).password).toBeUndefined()
    })
  })

  describe('fromRaw', () => {
    it('Telnet: 从原始数据还原', () => {
      const raw = {
        id: 1,
        name: 'MyTelnet',
        connectionType: 'telnet',
        host: '192.168.1.1',
        port: 2323,
        username: 'admin',
        password: '***MASKED***'
      }
      const conn = TelnetStrategy.fromRaw(raw)
      expect(conn.id).toBe(1)
      expect(conn.name).toBe('MyTelnet')
      expect(conn.host).toBe('192.168.1.1')
      expect(conn.port).toBe(2323)
      expect(conn.username).toBe('admin')
    })

    it('Telnet: 空原始数据使用默认值', () => {
      const conn = TelnetStrategy.fromRaw({})
      expect(conn.connectionType).toBe('telnet')
      expect(conn.name).toBe('')
      expect(conn.host).toBe('')
      expect(conn.port).toBe(23)
      expect(conn.username).toBe('')
      expect(conn.password).toBe('')
    })

    it('Ssh: 默认端口 22', () => {
      const conn = SshStrategy.fromRaw({})
      expect(conn.port).toBe(22)
    })

    it('Com: 所有字段都有默认值', () => {
      const conn = ComStrategy.fromRaw({})
      expect(conn.baudRate).toBe(9600)
      expect(conn.dataBits).toBe(8)
      expect(conn.stopBits).toBe(1)
      expect(conn.parity).toBe('none')
      expect(conn.encoding).toBe('utf8')
      expect(conn.flowControl).toBe('none')
      expect(conn.rts).toBe(false)
      expect(conn.dtr).toBe(false)
    })

    it('Com: 从原始数据还原全部字段', () => {
      const raw = {
        id: 5,
        name: 'COM1',
        comName: 'COM3',
        baudRate: 115200,
        dataBits: 7,
        stopBits: 2,
        parity: 'even',
        encoding: 'ascii',
        readTimeout: 1000,
        writeTimeout: 500,
        flowControl: 'hardware',
        rts: true,
        dtr: true,
        host: '',
        port: 0,
        username: '',
        password: ''
      }
      const conn = ComStrategy.fromRaw(raw)
      expect(conn.id).toBe(5)
      expect(conn.comName).toBe('COM3')
      expect(conn.baudRate).toBe(115200)
      expect(conn.dataBits).toBe(7)
      expect(conn.stopBits).toBe(2)
      expect(conn.parity).toBe('even')
      expect(conn.encoding).toBe('ascii')
      expect(conn.readTimeout).toBe(1000)
      expect(conn.writeTimeout).toBe(500)
      expect(conn.flowControl).toBe('hardware')
      expect(conn.rts).toBe(true)
      expect(conn.dtr).toBe(true)
    })

    it('Ftp: 从原始数据还原 ftp 字段', () => {
      const raw = {
        id: 2,
        name: 'FTP Server',
        connectionType: 'ftp',
        ftpMode: 'client',
        host: '10.0.0.1',
        port: 2121,
        username: 'user',
        password: 'pass',
        ftpDirectory: '/data',
        ftpPermissions: ['get', 'put']
      }
      const conn = FtpStrategy.fromRaw(raw)
      expect(conn.ftpMode).toBe('client')
      expect(conn.ftpDirectory).toBe('/data')
      expect(conn.ftpPermissions).toEqual(['get', 'put'])
    })

    it('Ftp: 空 raw 使用默认 permissions', () => {
      const conn = FtpStrategy.fromRaw({})
      expect(conn.ftpPermissions).toEqual(['get', 'put', 'delete', 'rename'])
    })

    it('Http: 默认端口 80', () => {
      const conn = HttpStrategy.fromRaw({})
      expect(conn.port).toBe(80)
    })

    it('Tftp: 默认端口 69', () => {
      const conn = TftpStrategy.fromRaw({})
      expect(conn.port).toBe(69)
    })

    it('Tcp: 默认端口 0', () => {
      const conn = TcpStrategy.fromRaw({})
      expect(conn.port).toBe(0)
    })

    it('Udp: 默认端口 0', () => {
      const conn = UdpStrategy.fromRaw({})
      expect(conn.port).toBe(0)
    })

    it('Ping: 从原始数据还原 host', () => {
      const conn = PingStrategy.fromRaw({ id: 1, name: 'PingTest', host: '8.8.8.8' })
      expect(conn.id).toBe(1)
      expect(conn.name).toBe('PingTest')
      expect(conn.connectionType).toBe('ping')
      expect(conn.host).toBe('8.8.8.8')
    })

    it('Ping: 空 raw 使用默认值', () => {
      const conn = PingStrategy.fromRaw({})
      expect(conn.connectionType).toBe('ping')
      expect(conn.name).toBe('')
      expect(conn.host).toBe('')
    })
  })

  describe('fromRaw - 数据安全', () => {
    it('fromRaw 不修改原始对象', () => {
      const raw = { host: '1.2.3.4', port: 999 }
      const orig = JSON.stringify(raw)
      TelnetStrategy.fromRaw(raw)
      expect(JSON.stringify(raw)).toBe(orig)
    })

    it('fromRaw 返回新对象（浅拷贝）', () => {
      const raw = { host: '1.2.3.4' }
      const conn = TelnetStrategy.fromRaw(raw)
      expect(conn).not.toBe(raw)
    })
  })
})
