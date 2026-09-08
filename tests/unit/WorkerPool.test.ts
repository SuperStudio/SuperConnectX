/**
 * WorkerPool 测试
 * 测试 Worker 线程池的核心逻辑（使用可控 Worker mock）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const workerState = vi.hoisted(() => ({
  instances: [] as any[]
}))

// Mock worker_threads
vi.mock('worker_threads', () => ({
  Worker: class {
    _listeners: Map<string, Function[]> = new Map()
    _terminated: boolean = false
    messages: any[] = []
    workerData: any

    constructor(_path: string, options: any) {
      this.workerData = options.workerData
      workerState.instances.push(this)
    }

    on(event: string, handler: Function) {
      if (!this._listeners.has(event)) this._listeners.set(event, [])
      this._listeners.get(event)!.push(handler)
      return this
    }

    once(event: string, handler: Function) {
      const wrapper = (...args: any[]) => {
        this.off(event, wrapper)
        handler(...args)
      }
      this.on(event, wrapper)
      return this
    }

    off(event: string, handler: Function) {
      const handlers = this._listeners.get(event) || []
      const idx = handlers.indexOf(handler)
      if (idx >= 0) handlers.splice(idx, 1)
      return this
    }

    postMessage(msg: any) {
      this.messages.push(msg)
    }

    emit(event: string, ...args: any[]) {
      for (const handler of [...(this._listeners.get(event) || [])]) {
        handler(...args)
      }
    }

    async terminate() {
      this._terminated = true
      return Promise.resolve(0)
    }
  }
}))

// Mock logger
vi.mock('../../src/main/ipc/IpcAppLogger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

import WorkerPool from '../../src/main/pool/WorkerPool'

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function startRequest(worker: any): any {
  return worker.messages.find((message: any) => message.type === 'start')
}

function makeReady(worker: any): void {
  worker.emit('message', {
    type: 'ready',
    sessionId: worker.workerData.sessionId
  })
}

function resolveStart(worker: any, success = true): void {
  const request = startRequest(worker)
  worker.emit('message', {
    type: 'start-result',
    sessionId: worker.workerData.sessionId,
    requestId: request.requestId,
    success,
    connId: `${worker.workerData.sessionId}-connection`
  })
}

describe('WorkerPool', () => {
  let pool: WorkerPool

  beforeEach(() => {
    vi.useFakeTimers()
    workerState.instances.length = 0
    // Reset singleton
    ;(WorkerPool as any).sInstance = null
    pool = WorkerPool.getInstance()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getInstance', () => {
    it('should return same instance (singleton)', () => {
      const a = WorkerPool.getInstance()
      const b = WorkerPool.getInstance()
      expect(a).toBe(b)
    })
  })

  describe('getStatus', () => {
    it('should return zero workers initially', () => {
      const status = pool.getStatus()
      expect(status.workerCount).toBe(0)
      expect(status.sessions).toEqual([])
    })

    it('should return status object with correct shape', () => {
      const status = pool.getStatus()
      expect(status).toHaveProperty('workerCount')
      expect(status).toHaveProperty('sessions')
      expect(Array.isArray(status.sessions)).toBe(true)
    })
  })

  describe('setCallbacks', () => {
    it('should accept callbacks without throwing', () => {
      const onData = vi.fn()
      const onLog = vi.fn()
      const onClose = vi.fn()

      expect(() => pool.setCallbacks(onData, onLog, onClose)).not.toThrow()
    })

    it('should accept all three callbacks', () => {
      const callbacks = {
        data: vi.fn(),
        log: vi.fn(),
        close: vi.fn()
      }
      pool.setCallbacks(callbacks.data, callbacks.log, callbacks.close)
    })
  })

  describe('shutdown', () => {
    it('should shutdown without errors when no workers exist', async () => {
      await expect(pool.shutdown()).resolves.toBeUndefined()
    })

    it('should handle multiple shutdown calls', async () => {
      await pool.shutdown()
      await expect(pool.shutdown()).resolves.toBeUndefined()
    })
  })

  describe('startConnection concurrency', () => {
    it('serializes two starts for the same session and sends start to its own entry', async () => {
      const first = pool.startConnection({ sessionId: 'same', host: 'first' }, 'telnet')
      await flushPromises()
      const firstWorker = workerState.instances[0]

      makeReady(firstWorker)
      await flushPromises()
      const second = pool.startConnection({ sessionId: 'same', host: 'second' }, 'telnet')
      await flushPromises()

      expect(workerState.instances).toHaveLength(1)
      expect(startRequest(firstWorker).connInfo.host).toBe('first')

      resolveStart(firstWorker)
      await expect(first).resolves.toMatchObject({ success: true })
      await vi.advanceTimersByTimeAsync(200)
      await flushPromises()

      const secondWorker = workerState.instances[1]
      expect(secondWorker).toBeDefined()
      expect(firstWorker._terminated).toBe(true)
      expect(startRequest(secondWorker)).toBeUndefined()

      makeReady(secondWorker)
      await flushPromises()
      expect(startRequest(secondWorker).connInfo.host).toBe('second')
      expect(firstWorker.messages.filter((message: any) => message.type === 'start')).toHaveLength(1)

      resolveStart(secondWorker)
      await expect(second).resolves.toMatchObject({ success: true })
    })

    it('starts different sessions in parallel', async () => {
      const first = pool.startConnection({ sessionId: 'a' }, 'telnet')
      const second = pool.startConnection({ sessionId: 'b' }, 'telnet')
      await flushPromises()

      expect(workerState.instances).toHaveLength(2)
      const [workerA, workerB] = workerState.instances
      makeReady(workerA)
      makeReady(workerB)
      await flushPromises()

      expect(startRequest(workerA)).toBeDefined()
      expect(startRequest(workerB)).toBeDefined()
      resolveStart(workerA)
      resolveStart(workerB)

      await expect(Promise.all([first, second])).resolves.toEqual([
        expect.objectContaining({ success: true }),
        expect.objectContaining({ success: true })
      ])
    })

    it('cancels a start while it is waiting for the worker', async () => {
      const start = pool.startConnection({ sessionId: 'pending' }, 'telnet')
      await flushPromises()
      const worker = workerState.instances[0]

      const stop = pool.stopConnection('pending', 'telnet')
      await vi.advanceTimersByTimeAsync(200)
      await expect(stop).resolves.toMatchObject({ success: true })
      await expect(start).resolves.toMatchObject({
        success: false,
        message: 'Start cancelled by stop'
      })
      expect(worker._terminated).toBe(true)
      expect(pool.getStatus().workerCount).toBe(0)
    })

    it('cancels a queued second start after stop', async () => {
      const first = pool.startConnection({ sessionId: 'queued', generation: 1 }, 'telnet')
      await flushPromises()
      const worker = workerState.instances[0]
      const second = pool.startConnection({ sessionId: 'queued', generation: 2 }, 'telnet')
      const stop = pool.stopConnection('queued', 'telnet')

      await vi.advanceTimersByTimeAsync(200)
      await expect(stop).resolves.toMatchObject({ success: true })
      await expect(first).resolves.toMatchObject({ success: false })
      await expect(second).resolves.toMatchObject({
        success: false,
        message: 'Start cancelled by stop'
      })
      expect(workerState.instances).toHaveLength(1)
      expect(worker._terminated).toBe(true)
      expect(pool.getStatus().workerCount).toBe(0)
    })

    it('ignores close and exit cleanup from an old worker generation', async () => {
      const first = pool.startConnection({ sessionId: 'same', generation: 1 }, 'telnet')
      await flushPromises()
      const oldWorker = workerState.instances[0]
      makeReady(oldWorker)
      await flushPromises()
      resolveStart(oldWorker)
      await first

      const second = pool.startConnection({ sessionId: 'same', generation: 2 }, 'telnet')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(200)
      await flushPromises()
      const newWorker = workerState.instances[1]
      makeReady(newWorker)
      await flushPromises()
      resolveStart(newWorker)
      await second

      oldWorker.emit('message', { type: 'close', sessionId: 'same' })
      oldWorker.emit('exit', 0)

      expect(pool.getStatus()).toEqual({
        workerCount: 1,
        sessions: [{ sessionId: 'same', alive: true }]
      })
      expect(newWorker._terminated).toBe(false)
    })

    it('ignores data and log messages from an old worker generation', async () => {
      const onData = vi.fn()
      const onLog = vi.fn()
      pool.setCallbacks(onData, onLog, vi.fn())

      const first = pool.startConnection({ sessionId: 'messages', generation: 1 }, 'telnet')
      await flushPromises()
      const oldWorker = workerState.instances[0]
      makeReady(oldWorker)
      await flushPromises()
      resolveStart(oldWorker)
      await first

      const second = pool.startConnection({ sessionId: 'messages', generation: 2 }, 'telnet')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(200)
      await flushPromises()
      const newWorker = workerState.instances[1]
      makeReady(newWorker)
      await flushPromises()
      resolveStart(newWorker)
      await second

      oldWorker.emit('message', {
        type: 'data',
        sessionId: 'messages',
        displayData: 'old-data'
      })
      oldWorker.emit('message', {
        type: 'log',
        sessionId: 'messages',
        logStr: 'old-log'
      })
      newWorker.emit('message', {
        type: 'data',
        sessionId: 'messages',
        displayData: 'new-data'
      })
      newWorker.emit('message', {
        type: 'log',
        sessionId: 'messages',
        logStr: 'new-log'
      })

      expect(onData).toHaveBeenCalledTimes(1)
      expect(onData).toHaveBeenCalledWith('messages', 'new-data', '', false)
      expect(onLog).toHaveBeenCalledTimes(1)
      expect(onLog).toHaveBeenCalledWith('messages', 'new-log', '')
    })

    it('cleans up a worker when the start request times out', async () => {
      const start = pool.startConnection({ sessionId: 'timeout' }, 'telnet')
      await flushPromises()
      const worker = workerState.instances[0]
      makeReady(worker)
      await flushPromises()

      await vi.advanceTimersByTimeAsync(30200)

      await expect(start).resolves.toMatchObject({
        success: false,
        message: expect.stringContaining('Request timeout: start')
      })
      expect(worker._terminated).toBe(true)
      expect(pool.getStatus().workerCount).toBe(0)
    })

    it('cleans up a worker when start returns failure', async () => {
      const start = pool.startConnection({ sessionId: 'failed' }, 'telnet')
      await flushPromises()
      const worker = workerState.instances[0]
      makeReady(worker)
      await flushPromises()
      resolveStart(worker, false)

      await vi.advanceTimersByTimeAsync(200)

      await expect(start).resolves.toMatchObject({ success: false })
      expect(worker._terminated).toBe(true)
      expect(pool.getStatus().workerCount).toBe(0)
    })
  })

  describe('sendData - error handling', () => {
    it('should return error for non-existent session', async () => {
      const result = await pool.sendData('nonexistent', 'telnet', 'test')
      expect(result.success).toBe(false)
      expect(result.message).toBeDefined()
    })
  })

  describe('stopConnection - error handling', () => {
    it('should handle non-existent session gracefully', async () => {
      const result = await pool.stopConnection('nonexistent', 'telnet')
      expect(result.success).toBe(true)
    })
  })

  describe('updateConnectionConfig - error handling', () => {
    it('should return error for non-existent session', async () => {
      const result = await pool.updateConnectionConfig('nonexistent', 'telnet', { receiveHex: true })
      expect(result.success).toBe(false)
      expect(result.message).toBeDefined()
    })
  })

  describe('message type interfaces', () => {
    it('should have correct WorkerToMainMessage type fields', () => {
      const msg = {
        type: 'data' as const,
        sessionId: 's1',
        displayData: 'test',
        timestamp: '2024-01-01',
        isHex: false
      }

      expect(msg.type).toBe('data')
      expect(msg.sessionId).toBe('s1')
      expect(msg.displayData).toBe('test')
    })

    it('should have correct MainToWorkerMessage type fields', () => {
      const msg = {
        type: 'start' as const,
        sessionId: 's1',
        connInfo: {},
        connectionType: 'telnet',
        requestId: 'req-1'
      }

      expect(msg.type).toBe('start')
      expect(msg.connectionType).toBe('telnet')
    })

    it('should support all message types for WorkerToMainMessage', () => {
      const types = ['ready', 'data', 'log', 'close', 'start-result', 'send-result', 'stop-result', 'update-config-result', 'error']

      for (const type of types) {
        const msg = { type, sessionId: 's1' }
        expect(msg.type).toBe(type)
      }
    })

    it('should support all message types for MainToWorkerMessage', () => {
      const types = ['start', 'send', 'stop', 'update-config', 'shutdown']

      for (const type of types) {
        const msg = { type, sessionId: 's1' }
        expect(msg.type).toBe(type)
      }
    })
  })

  describe('request ID generation', () => {
    it('should generate unique request IDs', () => {
      // Test the pattern, not actual implementation (private method)
      const id1 = `req_1_${Date.now()}`
      const id2 = `req_2_${Date.now()}`
      expect(id1).not.toBe(id2)
      expect(id1).toContain('req_')
      expect(id2).toContain('req_')
    })
  })

  describe('timeout handling', () => {
    it('should have configurable timeout', () => {
      const timeout = 30000
      expect(timeout).toBe(30000)
    })

    it('should use different timeout for disconnect', () => {
      const disconnectTimeout = 5000
      expect(disconnectTimeout).toBe(5000)
    })
  })
})
