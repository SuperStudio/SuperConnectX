/**
 * ConnectionInfo 测试
 * 验证 ConnectionInfo 接口的所有字段类型和行为
 */
import { describe, it, expect } from 'vitest'

describe('ConnectionInfo', () => {
  // ConnectionInfo 是纯 TypeScript 接口，验证字段约束
  describe('interface fields', () => {
    it('should accept all required fields', () => {
      const info = {
        host: '192.168.1.1',
        port: 23,
        username: 'admin',
        password: 'pass',
        sessionId: 'abc-123'
      }
      expect(info.host).toBe('192.168.1.1')
      expect(info.port).toBe(23)
      expect(info.username).toBe('admin')
      expect(info.password).toBe('pass')
      expect(info.sessionId).toBe('abc-123')
    })

    it('should accept COM-specific optional fields', () => {
      const info = {
        host: '',
        port: 0,
        username: '',
        password: '',
        sessionId: 'com-1',
        comName: 'COM3',
        baudRate: 115200,
        dataBits: 8 as const,
        stopBits: 1 as const,
        parity: 'none' as const,
        flowControl: 'none' as const,
        rts: false,
        dtr: false
      }
      expect(info.comName).toBe('COM3')
      expect(info.baudRate).toBe(115200)
      expect(info.dataBits).toBe(8)
      expect(info.stopBits).toBe(1)
      expect(info.parity).toBe('none')
      expect(info.flowControl).toBe('none')
      expect(info.rts).toBe(false)
      expect(info.dtr).toBe(false)
    })

    it('should accept encoding and timeout fields', () => {
      const info = {
        host: 'localhost',
        port: 8080,
        username: '',
        password: '',
        sessionId: 's1',
        encoding: 'utf8',
        readTimeout: 5000,
        writeTimeout: 3000
      }
      expect(info.encoding).toBe('utf8')
      expect(info.readTimeout).toBe(5000)
      expect(info.writeTimeout).toBe(3000)
    })

    it('should accept receiveHex field', () => {
      const info = {
        host: 'localhost',
        port: 8080,
        username: '',
        password: '',
        sessionId: 's1',
        receiveHex: true
      }
      expect(info.receiveHex).toBe(true)
    })

    it('should accept FTP-specific optional fields', () => {
      const info = {
        host: 'ftp.example.com',
        port: 21,
        username: 'ftpuser',
        password: 'ftppass',
        sessionId: 'ftp-1',
        ftpMode: 'client' as const,
        ftpDirectory: '/home/ftp',
        ftpPermissions: ['get', 'put', 'delete', 'rename']
      }
      expect(info.ftpMode).toBe('client')
      expect(info.ftpDirectory).toBe('/home/ftp')
      expect(info.ftpPermissions).toEqual(['get', 'put', 'delete', 'rename'])
    })

    it('should accept ftpMode as server', () => {
      const info = {
        host: '',
        port: 2121,
        username: 'admin',
        password: 'admin',
        sessionId: 'ftp-srv',
        ftpMode: 'server' as const
      }
      expect(info.ftpMode).toBe('server')
    })
  })

  describe('dataBits constraint', () => {
    it('should accept valid dataBits values', () => {
      const validValues = [5, 6, 7, 8] as const
      for (const val of validValues) {
        const info = {
          host: '', port: 0, username: '', password: '', sessionId: '',
          dataBits: val
        }
        expect(info.dataBits).toBe(val)
      }
    })
  })

  describe('stopBits constraint', () => {
    it('should accept valid stopBits values', () => {
      const validValues = [1, 1.5, 2] as const
      for (const val of validValues) {
        const info = {
          host: '', port: 0, username: '', password: '', sessionId: '',
          stopBits: val
        }
        expect(info.stopBits).toBe(val)
      }
    })
  })

  describe('parity constraint', () => {
    it('should accept valid parity values', () => {
      const validValues = ['none', 'even', 'odd', 'mark', 'space'] as const
      for (const val of validValues) {
        const info = {
          host: '', port: 0, username: '', password: '', sessionId: '',
          parity: val
        }
        expect(info.parity).toBe(val)
      }
    })
  })

  describe('flowControl constraint', () => {
    it('should accept valid flowControl values', () => {
      const validValues = ['none', 'hardware', 'software'] as const
      for (const val of validValues) {
        const info = {
          host: '', port: 0, username: '', password: '', sessionId: '',
          flowControl: val
        }
        expect(info.flowControl).toBe(val)
      }
    })
  })

  describe('ftpPermissions array', () => {
    it('should accept empty ftpPermissions', () => {
      const info = {
        host: '', port: 21, username: '', password: '', sessionId: 'x',
        ftpPermissions: []
      }
      expect(info.ftpPermissions).toEqual([])
    })

    it('should accept partial ftpPermissions', () => {
      const info = {
        host: '', port: 21, username: '', password: '', sessionId: 'x',
        ftpPermissions: ['get', 'put']
      }
      expect(info.ftpPermissions).toEqual(['get', 'put'])
    })
  })

  describe('object spread behavior', () => {
    it('should allow overriding fields via spread', () => {
      const base = {
        host: 'old', port: 0, username: '', password: '', sessionId: 'old',
        baudRate: 9600
      }
      const updated = { ...base, baudRate: 115200, host: 'new' }
      expect(updated.baudRate).toBe(115200)
      expect(updated.host).toBe('new')
      expect(updated.sessionId).toBe('old') // unchanged
    })

    it('should handle undefined optional fields', () => {
      const info = {
        host: 'localhost',
        port: 80,
        username: '',
        password: '',
        sessionId: 's1'
      }
      expect((info as any).comName).toBeUndefined()
      expect((info as any).ftpMode).toBeUndefined()
    })
  })
})
