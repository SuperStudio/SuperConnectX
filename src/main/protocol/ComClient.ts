import { SerialPort } from 'serialport'
import BaseClient, { ILogger } from './BaseClient'
import ConnectionInfo from './ConnectionInfo'
import { BufferLineSplitter } from './BufferLineSplitter'
import * as iconv from 'iconv-lite'

const DEFAULT_BAUD_RATE = 9600
const DEFAULT_DATA_BITS = 8
const DEFAULT_STOP_BITS = 1
const DEFAULT_PARITY = 'none' as const
const DEFAULT_ENCODING = 'utf8'
const READ_INTERVAL_MS = 10 // 固定10ms读取间隔
const FLUSH_TIMEOUT_MS = 100 // 空闲超时：buffer 中有数据但超过此时间无新数据到达，强制刷新

interface SerialConnection {
  port: SerialPort
  buffer: Buffer
  timer: NodeJS.Timeout | null
  flushTimer: NodeJS.Timeout | null
  lastDataTime: number
  writeTimeout: number
  encoding: string
  onData: any
  onClose: any
  onLog: any
  receiveHex: boolean
  splitter: BufferLineSplitter
}

export default class ComClient extends BaseClient {
  serialConnections = new Map<string, SerialConnection>()

  constructor(logger?: ILogger) {
    super(logger)
  }

  // 处理缓冲区数据，按行分割并添加时间戳
  private processBuffer(connection: SerialConnection): void {
    try {
      const { buffer, splitter, onData, onLog } = connection
      if (!buffer || buffer.length === 0) return

      const result = splitter.split(buffer)
      connection.buffer = result.remainder

      if (result.count > 0) {
        const timestamp = BufferLineSplitter.timestamp()
        onData?.({ data: result.data, timestamp })
        onLog?.(result.log, timestamp)
      }
    } catch (err: any) {
      this.logger.error(`processBuffer error: ${err?.message || err}`)
    }
  }

  /**
   * 空闲超时检查：如果 buffer 中有未完成的数据，
   * 且距离上次收到新数据超过 FLUSH_TIMEOUT_MS，则强制刷新
   */
  private checkFlushBuffer(connection: SerialConnection): void {
    if (!connection.buffer || connection.buffer.length === 0) return
    const elapsed = Date.now() - connection.lastDataTime
    if (elapsed < FLUSH_TIMEOUT_MS) return

    const { buffer, splitter, onData, onLog } = connection
    const timestamp = BufferLineSplitter.timestamp()
    const remainingStr = splitter.decodeFull(buffer)
    connection.buffer = Buffer.alloc(0)
    connection.lastDataTime = Date.now()

    this.logger.info(`serial idle flush: ${buffer.length} bytes after ${elapsed}ms idle`)
    onData?.({ data: remainingStr, timestamp })
    onLog?.(splitter.toLogLine(remainingStr), timestamp)
  }

  async start(info: ConnectionInfo, onData: any, onClose: any, onLog: any): Promise<object> {
    const comName = info.comName
    const baudRate = info.baudRate || DEFAULT_BAUD_RATE
    const dataBits = info.dataBits || DEFAULT_DATA_BITS
    const stopBits = info.stopBits || DEFAULT_STOP_BITS
    const parity = info.parity || DEFAULT_PARITY
    const encoding = (typeof info.encoding === 'string' && info.encoding.length > 0) ? info.encoding : DEFAULT_ENCODING
    const readTimeout = info.readTimeout || 0
    const writeTimeout = info.writeTimeout || 0
    const sessionId = info.sessionId

    if (!comName) {
      return { success: false, message: 'COM port name cannot be empty' }
    }

    try {
      this.logger.info(`start to connect serial port: ${comName} @ ${baudRate} (session: ${sessionId})`)
      this.logger.debug(`dataBits: ${dataBits}, stopBits: ${stopBits}, parity: ${parity}, encoding: ${encoding}, readTimeout: ${readTimeout}`)

      // 获取流控制配置
      const flowControl = info.flowControl || 'none'
      const rtscts = flowControl === 'hardware'
      const dsrdtr = flowControl === 'hardware'
      const xon = flowControl === 'software'
      const xoff = flowControl === 'software'
      const rtsInitial = info.rts !== undefined ? info.rts : true
      const dtrInitial = info.dtr !== undefined ? info.dtr : true

      const port = new SerialPort({
        path: comName,
        baudRate: baudRate,
        dataBits: dataBits,
        stopBits: stopBits,
        parity: parity,
        autoOpen: false,
        rtscts: rtscts,
        dsrdtr: dsrdtr,
        xon: xon,
        xoff: xoff,
        rts: rtsInitial,
        dtr: dtrInitial,
        timeout: readTimeout
      })

      return new Promise((resolve, reject) => {
        port.once('open', () => {
          this.logger.info(`serial port opened successfully`)

          const connection: SerialConnection = {
            port,
            buffer: Buffer.alloc(0),
            timer: null,
            flushTimer: null,
            lastDataTime: Date.now(),
            writeTimeout: writeTimeout,
            encoding: encoding,
            onData: onData,
            onClose: onClose,
            onLog: onLog,
            receiveHex: info.receiveHex === true,
            splitter: new BufferLineSplitter(encoding, info.receiveHex === true)
          }
          this.serialConnections.set(sessionId, connection)

          // 收集原始 Buffer 数据到缓冲区（不在 data 事件中 toString，避免多字节字符被分割）
          port.on('data', (data: Buffer) => {
            try {
              connection.buffer = Buffer.concat([connection.buffer, data])
              connection.lastDataTime = Date.now()
            } catch (err: any) {
              this.logger.error(`serial data concat error: ${err?.message || err}`)
            }
          })

          // 使用固定间隔处理数据
          connection.timer = setInterval(() => {
            this.processBuffer(connection)
          }, READ_INTERVAL_MS)

          // 空闲超时刷新：如果 buffer 中有数据但长时间无新数据，强制刷新剩余数据
          connection.flushTimer = setInterval(() => {
            this.checkFlushBuffer(connection)
          }, FLUSH_TIMEOUT_MS)

          port.on('close', () => {
            this.logger.info(`serial port closed: ${comName}`)
            if (connection.timer) {
              clearInterval(connection.timer)
              connection.timer = null
            }
            if (connection.flushTimer) {
              clearInterval(connection.flushTimer)
              connection.flushTimer = null
            }
            // 关闭前输出缓冲区中剩余的数据
            if (connection.buffer && connection.buffer.length > 0) {
              const timestamp = BufferLineSplitter.timestamp()
              const remainingStr = connection.splitter.decodeFull(connection.buffer)
              connection.onData?.({ data: remainingStr, timestamp })
              connection.onLog?.(connection.splitter.toLogLine(remainingStr), timestamp)
              connection.buffer = Buffer.alloc(0)
            }
            this.serialConnections.delete(sessionId)
            connection.onClose?.()
          })

          port.on('error', (err: Error) => {
            this.logger.error(`serial port error: ${err.message}`)
          })

          resolve({ success: true, message: 'Connected successfully', connId: sessionId })
        })

        port.once('error', (err: Error) => {
          this.logger.error(`serial port open failed: ${err.message}`)
          reject(this.wrapOpenError(err, comName))
        })

        port.open((err: Error | null) => {
          if (err) {
            this.logger.error(`serial port open error: ${err.message}`)
            reject(this.wrapOpenError(err, comName))
          }
        })
      })
    } catch (error) {
      this.logger.error('serial connect failed', { comName, baudRate, sessionId, error })
      return {
        success: false,
        message: error instanceof Error ? error.message : '连接失败',
        // 错误码透传给渲染进程（如 Linux EACCES），用于展示「修复权限」入口
        code: error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined
      }
    }
  }

  private wrapOpenError(error: Error, comName: string): Error {
    if (process.platform === 'linux' && /EACCES|permission denied|权限不够/i.test(error.message)) {
      const wrapped = new Error(`没有访问 ${comName} 的权限。请重新插拔设备；若问题仍存在，请注销并重新登录后重试。`)
      ;(wrapped as NodeJS.ErrnoException).code = 'EACCES'
      return wrapped
    }
    return error.message ? error : new Error('打开串口失败')
  }

  /**
   * 检测字符串是否包含非 ASCII 字节（0x80-0xFF），即是否为 HEX 模式发送的二进制数据。
   * HEX 模式下 parseHexString 使用 String.fromCharCode() 将每个字节转为 JS 字符串中的字符，
   * 0x80-0xFF 范围的字节在 JS 字符串中对应 charCode 128-255，这些不是合法 UTF-8 单字节字符。
   */
  private isBinaryString(str: string): boolean {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i)
      if (code >= 0x80 && code <= 0xff) {
        return true
      }
    }
    return false
  }

  async send(connId: string, command: string, onComplete: any): Promise<object> {
    const connection = this.serialConnections.get(connId)
    if (!connection) {
      return { success: false, message: 'Connection does not exist' }
    }

    try {
      // HEX 模式下 command 是二进制字符串（含不可打印字符），日志需要转 hex 显示
      const isBinary = this.isBinaryString(command)
      const logCommand = isBinary
        ? Array.from({ length: command.length }, (_, i) => command.charCodeAt(i).toString(16).padStart(2, '0')).join(' ').toUpperCase()
        : command
      const dataStr = `[${new Date().toISOString()}] SEND >>>>>>>>>> ${logCommand}`

      // 检测是否为 HEX 模式发送的二进制数据（包含 0x80-0xFF 范围的字节）
      // 这类数据不能经过 UTF-8 等文本编码，必须作为原始字节直接写入串口

      // Node.js 原生 Buffer 编码集有限（utf8/ascii/latin1 等），不支持 gb2312/gbk/gb18030/big5 等
      // 对于非原生编码，使用 iconv-lite 先将字符串转为 Buffer 再写入串口
      const encoding = connection.encoding || DEFAULT_ENCODING
      const nativeEncodings = new Set(['ascii', 'utf8', 'utf-8', 'utf16le', 'ucs2', 'ucs-2', 'base64', 'base64url', 'latin1', 'binary', 'hex'])

      return new Promise((resolve) => {
        let writeData: Buffer | string
        let writeEncoding: BufferEncoding | undefined
        if (isBinary) {
          // HEX 模式二进制数据：直接构造 Buffer，逐字节写入，完全绕过字符编码层
          const buf = Buffer.alloc(command.length)
          for (let i = 0; i < command.length; i++) {
            buf[i] = command.charCodeAt(i) & 0xff
          }
          writeData = buf
          writeEncoding = undefined // Buffer 模式不需要 encoding 参数
        } else if (nativeEncodings.has(encoding)) {
          writeData = command
          writeEncoding = encoding as BufferEncoding
        } else {
          try {
            writeData = iconv.encode(command, encoding)
            writeEncoding = undefined // Buffer 模式下不需要 encoding 参数
          } catch (encodeErr: any) {
            this.logger.error(`iconv encode failed for ${encoding}: ${encodeErr?.message || encodeErr}`)
            resolve({ success: false, message: `编码转换失败 (${encoding}): ${encodeErr?.message || encodeErr}` })
            return
          }
        }

        connection.port.write(writeData, writeEncoding, (err: Error | null | undefined) => {
          if (err) {
            this.logger.error(`serial write error: ${err.message}`)
            resolve({ success: false, message: err.message })
            return
          }
          onComplete?.(dataStr)
          this.logger.info(`send command: ${logCommand}`)
          resolve({ success: true })
        })
      })
    } catch (error) {
      this.logger.error('serial send failed', { connId, command, error })
      return {
        success: false,
        message: error instanceof Error ? error.message : '发送命令失败'
      }
    }
  }

  async disconnect(connId: string): Promise<object> {
    const connection = this.serialConnections.get(connId)
    if (connection) {
      this.logger.info(`disconnect serial port: ${connection.port.path}`)

      // 停止定时器
      if (connection.timer) {
        clearInterval(connection.timer)
        connection.timer = null
      }
      if (connection.flushTimer) {
        clearInterval(connection.flushTimer)
        connection.flushTimer = null
      }

      // 断开前刷新缓冲区中剩余的数据
      if (connection.buffer && connection.buffer.length > 0) {
        const timestamp = BufferLineSplitter.timestamp()
        const remainingStr = connection.splitter.decodeFull(connection.buffer)
        connection.onData?.({ data: remainingStr, timestamp })
        connection.onLog?.(connection.splitter.toLogLine(remainingStr), timestamp)
        connection.buffer = Buffer.alloc(0)
      }

      // 主动断开前先调用 onClose 回调（触发 flushConnLog 将缓存日志写入文件），
      // 然后移除 close 监听器防止 port 关闭时再次触发
      const savedOnClose = connection.onClose
      connection.onClose = undefined
      connection.port.removeAllListeners('close')
      connection.port.close((err: Error | null) => {
        if (err) {
          this.logger.error(`serial port close error: ${err.message}`)
        }
      })
      this.serialConnections.delete(connId)
      // 在 port.close() 之后调用 onClose，确保端口资源已释放
      savedOnClose?.()
    } else {
      this.logger.warn('not find connId for disconnect', { connId })
    }
    return { success: true }
  }

  async updateConfig(connId: string, config: {
    baudRate?: number
    dataBits?: number
    stopBits?: number
    parity?: string
    encoding?: string
    readTimeout?: number
    writeTimeout?: number
    rts?: boolean
    dtr?: boolean
    flowControl?: 'none' | 'hardware' | 'software'
    receiveHex?: boolean
  }): Promise<object> {

    // 动态更新 receiveHex 参数
    if (config.receiveHex !== undefined) {
      const connection = this.serialConnections.get(connId)
      if (connection) {
        connection.receiveHex = config.receiveHex
        connection.splitter.updateReceiveHex(config.receiveHex)
        this.logger.info(`update serial receiveHex: ${config.receiveHex}, sessionId: ${connId}`)
        return { success: true, message: 'Updated successfully' }
      }
      return { success: false, message: 'Connection does not exist' }
    }

    const connection = this.serialConnections.get(connId)
    if (!connection) {
      return { success: false, message: 'Connection does not exist' }
    }

    const port = connection.port
    const comName = port.path

    // 更新配置
    const newBaudRate = config.baudRate || DEFAULT_BAUD_RATE
    const newDataBits = config.dataBits || DEFAULT_DATA_BITS
    const newStopBits = config.stopBits || DEFAULT_STOP_BITS
    const newParity = config.parity || DEFAULT_PARITY
    const newEncoding = config.encoding || connection.encoding || DEFAULT_ENCODING
    const newFlowControl = config.flowControl || 'none'
    const newRts = config.rts !== undefined ? config.rts : true
    const newDtr = config.dtr !== undefined ? config.dtr : true

    this.logger.info(`update serial config: ${comName} @ ${newBaudRate}, dataBits: ${newDataBits}, stopBits: ${newStopBits}, parity: ${newParity}, encoding: ${newEncoding}, flowControl: ${newFlowControl}, rts: ${newRts}, dtr: ${newDtr}`)

    return new Promise((resolve) => {
      // 保存回调
      const savedOnData = connection.onData
      const savedOnClose = connection.onClose

      // 停止定时器
      if (connection.timer) {
        clearInterval(connection.timer)
        connection.timer = null
      }

      // 移除原来的事件监听器，避免触发 onClose
      port.removeAllListeners('close')
      port.removeAllListeners('error')
      port.removeAllListeners('data')

      // 关闭当前端口
      port.close((err: Error | null) => {
        if (err) {
          this.logger.error(`close port error: ${err.message}`)
        }

        // 重新打开新配置的端口
        const newPort = new SerialPort({
          path: comName,
          baudRate: newBaudRate,
          dataBits: newDataBits,
          stopBits: newStopBits,
          parity: newParity,
          autoOpen: false,
          rtscts: newFlowControl === 'hardware',
          dsrdtr: newFlowControl === 'hardware',
          xon: newFlowControl === 'software',
          xoff: newFlowControl === 'software',
          rts: newRts,
          dtr: newDtr
        })

        newPort.once('open', () => {
          this.logger.info(`serial port reopened successfully with new config`)

          // 更新连接信息
          const newConnection: SerialConnection = {
            port: newPort,
            buffer: Buffer.alloc(0),
            timer: null,
            flushTimer: null,
            lastDataTime: Date.now(),
            writeTimeout: config.writeTimeout ?? connection.writeTimeout,
            encoding: newEncoding,
            onData: savedOnData,
            onClose: savedOnClose,
            onLog: connection.onLog,
            receiveHex: connection.receiveHex,
            splitter: new BufferLineSplitter(newEncoding, connection.receiveHex)
          }
            this.serialConnections.set(connId, newConnection)

          // 收集数据到缓冲区（Buffer 累积，避免多字节字符被分割）
          newPort.on('data', (data: Buffer) => {
            try {
              newConnection.buffer = Buffer.concat([newConnection.buffer, data])
              newConnection.lastDataTime = Date.now()
            } catch (err: any) {
              this.logger.error(`serial data concat error: ${err?.message || err}`)
            }
          })

          // 重新启动数据收集定时器
          newConnection.timer = setInterval(() => {
            this.processBuffer(newConnection)
          }, READ_INTERVAL_MS)

          // 空闲超时刷新
          newConnection.flushTimer = setInterval(() => {
            this.checkFlushBuffer(newConnection)
          }, FLUSH_TIMEOUT_MS)

          newPort.on('close', () => {
            this.logger.info(`serial port closed after update: ${comName}`)
            if (newConnection.timer) {
              clearInterval(newConnection.timer)
              newConnection.timer = null
            }
            if (newConnection.flushTimer) {
              clearInterval(newConnection.flushTimer)
              newConnection.flushTimer = null
            }
            this.serialConnections.delete(connId)
          })

          newPort.on('error', (err: Error) => {
            this.logger.error(`serial port error after update: ${err.message}`)
          })

          resolve({ success: true, message: 'Configuration updated successfully' })
        })

        newPort.once('error', (err: Error) => {
          this.logger.error(`reopen port error: ${err.message}`)
          // 尝试恢复原来的连接
          this.reopenPort(connId, connection)
          resolve({ success: false, message: err.message || '更新配置失败' })
        })

        newPort.open((err: Error | null) => {
          if (err) {
            this.logger.error(`open port error: ${err.message}`)
            this.reopenPort(connId, connection)
            resolve({ success: false, message: err.message || '打开串口失败' })
          }
        })
      })
    })
  }

  private reopenPort(connId: string, oldConnection: SerialConnection): void {
    const port = oldConnection.port
    const comName = port.path
    const baudRate = port.baudRate
    const encoding = oldConnection.encoding || DEFAULT_ENCODING

    const recoveryPort = new SerialPort({
      path: comName,
      baudRate: baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false
    })

    recoveryPort.open((err: Error | null) => {
      if (!err) {
        const newConnection: SerialConnection = {
          port: recoveryPort,
          buffer: Buffer.alloc(0),
          timer: null,
          flushTimer: null,
          lastDataTime: Date.now(),
          writeTimeout: oldConnection.writeTimeout,
          encoding: encoding,
          onData: oldConnection.onData,
          onClose: oldConnection.onClose,
          onLog: oldConnection.onLog,
          receiveHex: oldConnection.receiveHex,
          splitter: new BufferLineSplitter(encoding, oldConnection.receiveHex)
        }
        this.serialConnections.set(connId, newConnection)

        // 收集数据到缓冲区（Buffer 累积，避免多字节字符被分割）
        recoveryPort.on('data', (data: Buffer) => {
          try {
            newConnection.buffer = Buffer.concat([newConnection.buffer, data])
            newConnection.lastDataTime = Date.now()
          } catch (err: any) {
            this.logger.error(`serial data concat error: ${err?.message || err}`)
          }
        })

        newConnection.timer = setInterval(() => {
          this.processBuffer(newConnection)
        }, READ_INTERVAL_MS)

        // 空闲超时刷新
        newConnection.flushTimer = setInterval(() => {
          this.checkFlushBuffer(newConnection)
        }, FLUSH_TIMEOUT_MS)

        recoveryPort.on('close', () => {
          if (newConnection.timer) {
            clearInterval(newConnection.timer)
            newConnection.timer = null
          }
          if (newConnection.flushTimer) {
            clearInterval(newConnection.flushTimer)
            newConnection.flushTimer = null
          }
          this.serialConnections.delete(connId)
        })

        this.logger.info(`serial port recovered: ${comName} @ ${baudRate}`)
      } else {
        this.logger.error(`cannot recover serial port: ${err.message}`)
      }
    })
  }

  setReceiveHex(connId: string, receiveHex: boolean): void {
    const connection = this.serialConnections.get(connId)
    if (connection) {
      connection.receiveHex = receiveHex
      connection.splitter.updateReceiveHex(receiveHex)
      this.logger.info(`setReceiveHex: ${receiveHex} for sessionId: ${connId}`)
    }
  }
}
