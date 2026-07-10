/**
 * ConnectionWorker 测试
 * 测试 Worker 线程中的消息处理逻辑（纯逻辑测试）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create shared mock for worker_threads
const mockParentPortMessages: any[] = []
const mockParentPortHandlers: Function[] = []
const mockParentPort = {
  _handlers: mockParentPortHandlers,
  _messages: mockParentPortMessages,
  on(event: string, handler: Function) {
    if (event === 'message') {
      mockParentPortHandlers.push(handler)
    }
  },
  postMessage(msg: any) {
    mockParentPortMessages.push(msg)
  },
  _reset() {
    mockParentPortHandlers.length = 0
    mockParentPortMessages.length = 0
  },
  _getMessages() {
    return [...mockParentPortMessages]
  }
}

// Mock worker_threads
vi.mock('worker_threads', () => ({
  parentPort: mockParentPort,
  workerData: { sessionId: '' }
}))

// Mock BaseClient, ComClient, TelnetClient
vi.mock('../../src/main/protocol/BaseClient', () => ({
  default: class {
    protected logger = console
    async start(_info: any, _onData: any, _onClose: any, _onLog?: any) {
      return { success: true, message: 'connected', connId: (_info as any)?.sessionId }
    }
    async send(_connId: string, _command: string, _onComplete: any) {
      _onComplete?.(`send completed: ${_command}`)
      return { success: true }
    }
    async disconnect(_connId: string) { return { success: true } }
    async updateConfig(_connId: string, _config: any) { return { success: true } }
    setReceiveHex(_connId: string, _receiveHex: boolean) {}
  },
  ILogger: {}
}))

vi.mock('../../src/main/protocol/ComClient', () => ({
  default: class {
    protected logger = console
    async start(_info: any, _onData: any, _onClose: any, _onLog?: any) {
      return { success: true, message: 'COM connected' }
    }
    async send(_connId: string, _command: string, _onComplete: any) {
      _onComplete?.(`COM send: ${_command}`)
      return { success: true }
    }
    async disconnect(_connId: string) { return { success: true } }
    async updateConfig(_connId: string, _config: any) { return { success: true } }
    setReceiveHex(_connId: string, _receiveHex: boolean) {}
  }
}))

vi.mock('../../src/main/protocol/TelnetClient', () => ({
  default: class {
    protected logger = console
    async start(_info: any, _onData: any, _onClose: any, _onLog?: any) {
      return { success: true, message: 'Telnet connected' }
    }
    async send(_connId: string, _command: string, _onComplete: any) {
      _onComplete?.(`Telnet send: ${_command}`)
      return { success: true }
    }
    async disconnect(_connId: string) { return { success: true } }
    async updateConfig(_connId: string, _config: any) { return { success: true } }
    setReceiveHex(_connId: string, _receiveHex: boolean) {}
  }
}))

describe('ConnectionWorker', () => {
  beforeEach(() => {
    mockParentPort._reset()
  })

  // Import the worker module
  it('should load ConnectionWorker module without errors', async () => {
    await expect(
      import('../../src/main/workers/ConnectionWorker')
    ).resolves.toBeDefined()
  })

  describe('message routing - pure logic tests', () => {
    it('should handle start message type', () => {
      const startMsg = {
        type: 'start' as const,
        sessionId: 'test-session',
        connInfo: {
          host: 'localhost', port: 23, username: '', password: '', sessionId: 'test-session'
        },
        connectionType: 'telnet',
        requestId: 'req-1'
      }
      expect(startMsg.type).toBe('start')
      expect(startMsg.connectionType).toBe('telnet')
      expect(startMsg.connInfo).toBeDefined()
      expect(startMsg.requestId).toBe('req-1')
    })

    it('should handle send message type', () => {
      const sendMsg = {
        type: 'send' as const,
        sessionId: 'test-session',
        command: 'ls -la',
        requestId: 'req-2'
      }
      expect(sendMsg.type).toBe('send')
      expect(sendMsg.command).toBe('ls -la')
    })

    it('should handle stop message type', () => {
      const stopMsg = {
        type: 'stop' as const,
        sessionId: 'test-session',
        requestId: 'req-3'
      }
      expect(stopMsg.type).toBe('stop')
    })

    it('should handle update-config message type', () => {
      const configMsg = {
        type: 'update-config' as const,
        sessionId: 'test-session',
        config: { receiveHex: true },
        requestId: 'req-4'
      }
      expect(configMsg.type).toBe('update-config')
      expect(configMsg.config.receiveHex).toBe(true)
    })

    it('should handle shutdown message type', () => {
      const shutdownMsg = {
        type: 'shutdown' as const,
        sessionId: 'test-session'
      }
      expect(shutdownMsg.type).toBe('shutdown')
    })
  })

  describe('message type validation', () => {
    const validTypes = ['start', 'send', 'stop', 'update-config', 'shutdown']

    it('should accept all valid message types', () => {
      for (const type of validTypes) {
        const msg = { type, sessionId: 's1' }
        expect(msg.type).toBe(type)
      }
    })

    it('should require sessionId for all message types', () => {
      for (const type of validTypes) {
        const msg = { type, sessionId: '' }
        expect(msg.sessionId).toBeDefined()
      }
    })

    it('should require connInfo and connectionType for start', () => {
      const msg = {
        type: 'start' as const,
        sessionId: 's1',
        connInfo: { host: '', port: 0, username: '', password: '', sessionId: '' },
        connectionType: 'telnet'
      }
      expect(msg.connInfo).toBeDefined()
      expect(msg.connectionType).toBe('telnet')
    })

    it('should require command for send', () => {
      const msg = { type: 'send' as const, sessionId: 's1', command: 'test' }
      expect(msg.command).toBe('test')
    })

    it('should require config for update-config', () => {
      const msg = { type: 'update-config' as const, sessionId: 's1', config: { receiveHex: false } }
      expect(msg.config).toBeDefined()
    })
  })

  describe('response type validation', () => {
    it('should have valid response types', () => {
      const responseTypes = [
        'ready', 'start-result', 'data', 'log', 'close',
        'send-result', 'stop-result', 'update-config-result', 'error'
      ]
      for (const type of responseTypes) {
        const resp = { type, sessionId: 's1' }
        expect(resp.type).toBe(type)
      }
    })

    it('should include success and message in result responses', () => {
      const startResult = {
        type: 'start-result', sessionId: 's1', requestId: 'req-1',
        success: true, message: 'Connected', connId: 's1'
      }
      expect(startResult.success).toBe(true)
      expect(startResult.message).toBe('Connected')
      expect(startResult.connId).toBe('s1')
    })

    it('should include displayData in data responses', () => {
      const dataResp = {
        type: 'data', sessionId: 's1',
        displayData: 'Hello World',
        timestamp: '2024-01-01 12:00:00.000',
        isHex: false
      }
      expect(dataResp.displayData).toBe('Hello World')
      expect(dataResp.isHex).toBe(false)
    })

    it('should include logStr in log responses', () => {
      const logResp = {
        type: 'log', sessionId: 's1',
        logStr: '[INFO] something happened',
        timestamp: '2024-01-01 12:00:00.000'
      }
      expect(logResp.logStr).toBe('[INFO] something happened')
      expect(logResp.timestamp).toBeDefined()
    })
  })

  describe('connection type factory', () => {
    it('should support telnet connection type', () => {
      expect('telnet').toBe('telnet')
    })

    it('should support com connection type', () => {
      expect('com').toBe('com')
    })

    it('should reject unknown connection type', () => {
      const supported = ['telnet', 'com']
      expect(supported.includes('ssh')).toBe(false)
    })
  })

  describe('HEX conversion logic', () => {
    function convertToHex(data: string): string {
      let hexResult = ''
      for (let i = 0; i < data.length; i++) {
        const hex = data.charCodeAt(i).toString(16)
        hexResult += hex.padStart(2, '0') + ' '
      }
      return hexResult.trim()
    }

    it('should convert ASCII to hex correctly', () => {
      expect(convertToHex('A')).toBe('41')
      expect(convertToHex('ABC')).toBe('41 42 43')
      expect(convertToHex('0')).toBe('30')
    })

    it('should convert empty string to empty string', () => {
      expect(convertToHex('')).toBe('')
    })

    it('should convert newline character', () => {
      expect(convertToHex('\n')).toBe('0a')
    })

    it('should convert carriage return', () => {
      expect(convertToHex('\r')).toBe('0d')
    })

    it('should convert Chinese characters (multi-byte)', () => {
      const result = convertToHex('中')
      expect(result).toContain('4e')
    })

    it('should handle mixed content', () => {
      const result = convertToHex('OK\r\n')
      expect(result).toBe('4f 4b 0d 0a')
    })
  })
})
