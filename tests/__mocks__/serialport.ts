/**
 * Mock serialport 模块，用于 ComClient 集成测试
 * 模拟 SerialPort 的 open/data/close/error 事件流，不依赖真实串口硬件
 */

import { EventEmitter } from 'events'

export class MockSerialPort extends EventEmitter {
  path: string
  baudRate: number
  dataBits: number
  stopBits: number
  parity: string
  autoOpen: boolean
  rtscts: boolean
  dsrdtr: boolean
  xon: boolean
  xoff: boolean
  rts: boolean
  dtr: boolean
  timeout: number
  isOpen: boolean

  // 静态配置：控制 open 和 write 的行为
  static shouldOpenFail: boolean = false
  static shouldWriteFail: boolean = false
  static openError: Error | null = null
  static writeError: Error | null = null
  static openDelayMs: number = 0

  constructor(options: {
    path: string
    baudRate: number
    dataBits?: number
    stopBits?: number
    parity?: string
    autoOpen?: boolean
    rtscts?: boolean
    dsrdtr?: boolean
    xon?: boolean
    xoff?: boolean
    rts?: boolean
    dtr?: boolean
    timeout?: number
  }) {
    super()
    this.path = options.path
    this.baudRate = options.baudRate
    this.dataBits = options.dataBits ?? 8
    this.stopBits = options.stopBits ?? 1
    this.parity = options.parity ?? 'none'
    this.autoOpen = options.autoOpen ?? false
    this.rtscts = options.rtscts ?? false
    this.dsrdtr = options.dsrdtr ?? false
    this.xon = options.xon ?? false
    this.xoff = options.xoff ?? false
    this.rts = options.rts ?? true
    this.dtr = options.dtr ?? true
    this.timeout = options.timeout ?? 0
    this.isOpen = false
  }

  open(callback: (err: Error | null) => void): void {
    if (MockSerialPort.shouldOpenFail) {
      const err = MockSerialPort.openError || new Error('Mock open failed')
      // 用 process.nextTick 模拟异步
      process.nextTick(() => {
        this.emit('error', err)
        callback(err)
      })
      return
    }

    const doOpen = () => {
      this.isOpen = true
      callback(null)
      this.emit('open')
    }

    if (MockSerialPort.openDelayMs > 0) {
      setTimeout(doOpen, MockSerialPort.openDelayMs)
    } else {
      process.nextTick(doOpen)
    }
  }

  write(
    data: string | Buffer,
    encoding?: BufferEncoding,
    callback?: (err: Error | null | undefined) => void
  ): boolean {
    if (MockSerialPort.shouldWriteFail) {
      const err = MockSerialPort.writeError || new Error('Mock write failed')
      process.nextTick(() => callback?.(err))
      return false
    }
    process.nextTick(() => callback?.(null))
    return true
  }

  close(callback?: (err: Error | null) => void): void {
    this.isOpen = false
    process.nextTick(() => {
      this.emit('close')
      callback?.(null)
    })
  }

  /**
   * 模拟从串口收到数据（测试中调用）
   * 传入 Buffer，触发 'data' 事件
   */
  simulateData(data: Buffer | string): void {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
    this.emit('data', buf)
  }

  // 静态方法：重置所有 mock 状态
  static reset(): void {
    MockSerialPort.shouldOpenFail = false
    MockSerialPort.shouldWriteFail = false
    MockSerialPort.openError = null
    MockSerialPort.writeError = null
    MockSerialPort.openDelayMs = 0
  }
}

export const SerialPort = MockSerialPort

// 静态 list 方法
SerialPort.list = async () => {
  return [
    { path: 'COM1', manufacturer: 'Mock', pnpId: 'MOCK001' },
    { path: 'COM2', manufacturer: 'Mock', pnpId: 'MOCK002' }
  ]
}

export default SerialPort
