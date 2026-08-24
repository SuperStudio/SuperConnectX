/**
 * WorkerConnector 测试
 * 测试 Worker 模式判断、buildConnectInfo、代理方法
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockSetCallbacks,
  mockStartConnection,
  mockSendData,
  mockStopConnection,
  mockUpdateConfig,
  mockShutdown,
  mockGetStatus
} = vi.hoisted(() => {
  return {
    mockSetCallbacks: vi.fn(),
    mockStartConnection: vi.fn(async () => ({ success: true })),
    mockSendData: vi.fn(async () => ({ success: true })),
    mockStopConnection: vi.fn(async () => ({ success: true })),
    mockUpdateConfig: vi.fn(async () => ({ success: true })),
    mockShutdown: vi.fn(async () => {}),
    mockGetStatus: vi.fn(() => ({ workerCount: 0, sessions: [] }))
  }
})

vi.mock('../../src/main/pool/WorkerPool', () => ({
  default: {
    getInstance() {
      return {
        setCallbacks: mockSetCallbacks,
        startConnection: mockStartConnection,
        sendData: mockSendData,
        stopConnection: mockStopConnection,
        updateConnectionConfig: mockUpdateConfig,
        shutdown: mockShutdown,
        getStatus: mockGetStatus
      }
    }
  }
}))

import WorkerConnector from '../../src/main/ipc/connectors/WorkerConnector'

function makeConn(
  overrides: Partial<{
    connectionType: string
    host: string
    port: number
    sessionId: string
    comName: string
    baudRate: number
    encoding: string
    ftpMode: string
  }> = {}
): any {
  return {
    connectionType: 'telnet',
    host: '127.0.0.1',
    port: 23,
    sessionId: 's1',
    comName: '',
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    encoding: 'utf-8',
    readTimeout: 5000,
    writeTimeout: 5000,
    flowControl: 'none',
    rts: false,
    dtr: false,
    receiveHex: false,
    ftpMode: 'client',
    ftpDirectory: '/',
    ftpPermissions: ['read'],
    username: '',
    password: '',
    ...overrides
  }
}

describe('WorkerConnector', () => {
  let connector: WorkerConnector

  beforeEach(() => {
    vi.clearAllMocks()
    connector = new WorkerConnector()
  })

  // ============ shouldUseWorker ============

  describe('shouldUseWorker', () => {
    it('should return false when useWorkerMode is false', () => {
      expect(connector.shouldUseWorker(makeConn({ connectionType: 'telnet' }), false)).toBe(false)
      expect(connector.shouldUseWorker(makeConn({ connectionType: 'com' }), false)).toBe(false)
    })

    it('should return false for COM (regardless of useWorkerMode)', () => {
      expect(connector.shouldUseWorker(makeConn({ connectionType: 'com' }), true)).toBe(false)
    })

    it('should return false for FTP (regardless of useWorkerMode)', () => {
      expect(connector.shouldUseWorker(makeConn({ connectionType: 'ftp' }), true)).toBe(false)
    })

    it('should return true for Telnet when useWorkerMode is true', () => {
      expect(connector.shouldUseWorker(makeConn({ connectionType: 'telnet' }), true)).toBe(true)
    })

    it('should return true for unknown types when useWorkerMode is true', () => {
      expect(connector.shouldUseWorker(makeConn({ connectionType: 'ssh' as any }), true)).toBe(true)
    })
  })

  // ============ buildConnectInfo ============

  describe('buildConnectInfo', () => {
    it('should map all fields from conn to ConnectionInfo', () => {
      const conn = makeConn({
        host: '192.168.1.1',
        port: 22,
        sessionId: 'abc123',
        username: 'admin',
        password: 'secret'
      })

      const info = connector.buildConnectInfo(conn)
      expect(info.host).toBe('192.168.1.1')
      expect(info.port).toBe(22)
      expect(info.sessionId).toBe('abc123')
      expect(info.username).toBe('admin')
      expect(info.password).toBe('secret')
    })

    it('should include serial port fields', () => {
      const conn = makeConn({
        comName: 'COM3',
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      })

      const info = connector.buildConnectInfo(conn)
      expect(info.comName).toBe('COM3')
      expect(info.baudRate).toBe(115200)
      expect(info.dataBits).toBe(8)
      expect(info.stopBits).toBe(1)
      expect(info.parity).toBe('none')
    })

    it('should include encoding and timeout fields', () => {
      const conn = makeConn({
        encoding: 'ascii',
        readTimeout: 3000,
        writeTimeout: 3000
      })

      const info = connector.buildConnectInfo(conn)
      expect(info.encoding).toBe('ascii')
      expect(info.readTimeout).toBe(3000)
      expect(info.writeTimeout).toBe(3000)
    })

    it('should include FTP fields', () => {
      const conn = makeConn({
        connectionType: 'ftp',
        ftpMode: 'server',
        ftpDirectory: '/data',
        ftpPermissions: ['read', 'write']
      })

      const info = connector.buildConnectInfo(conn)
      expect(info.ftpMode).toBe('server')
      expect(info.ftpDirectory).toBe('/data')
      expect(info.ftpPermissions).toEqual(['read', 'write'])
    })

    it('should include flow control fields', () => {
      const conn = makeConn({
        flowControl: 'hardware',
        rts: true,
        dtr: false
      })

      const info = connector.buildConnectInfo(conn)
      expect(info.flowControl).toBe('hardware')
      expect(info.rts).toBe(true)
      expect(info.dtr).toBe(false)
    })
  })

  // ============ setCallbacks ============

  describe('setCallbacks', () => {
    it('should delegate to workerPool.setCallbacks', () => {
      const onData = vi.fn()
      const onLog = vi.fn()
      const onClose = vi.fn()

      connector.setCallbacks(onData, onLog, onClose)

      expect(mockSetCallbacks).toHaveBeenCalledWith(onData, onLog, onClose)
    })
  })

  // ============ 代理方法 ============

  describe('startConnection', () => {
    it('should delegate to workerPool.startConnection with correct args', async () => {
      const conn = makeConn({ connectionType: 'telnet', sessionId: 's1' })
      await connector.startConnection(conn)

      expect(mockStartConnection).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 's1' }),
        'telnet'
      )
    })
  })

  describe('sendData', () => {
    it('should delegate to workerPool.sendData', async () => {
      const conn = makeConn({ sessionId: 's1' })
      await connector.sendData(conn, 'ls -la')

      expect(mockSendData).toHaveBeenCalledWith('s1', 'telnet', 'ls -la')
    })
  })

  describe('stopConnection', () => {
    it('should delegate to workerPool.stopConnection', async () => {
      const conn = makeConn({ sessionId: 's1' })
      await connector.stopConnection(conn)

      expect(mockStopConnection).toHaveBeenCalledWith('s1', 'telnet')
    })
  })

  describe('updateConnectionConfig', () => {
    it('should delegate to workerPool.updateConnectionConfig', async () => {
      const conn = makeConn({ sessionId: 's1' })
      await connector.updateConnectionConfig(conn, { receiveHex: true })

      expect(mockUpdateConfig).toHaveBeenCalledWith('s1', 'telnet', { receiveHex: true })
    })
  })

  describe('shutdown', () => {
    it('should delegate to workerPool.shutdown', async () => {
      await connector.shutdown()
      expect(mockShutdown).toHaveBeenCalled()
    })
  })

  describe('getStatus', () => {
    it('should delegate to workerPool.getStatus', () => {
      const status = connector.getStatus()
      expect(mockGetStatus).toHaveBeenCalled()
      expect(status).toEqual({ workerCount: 0, sessions: [] })
    })
  })
})
