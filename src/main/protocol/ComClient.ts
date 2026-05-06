import { SerialPort } from 'serialport'
import logger from '../ipc/IpcAppLogger'
import BaseClient from './BaseClient'
import ConnectionInfo from './ConnectionInfo'

const DEFAULT_BAUD_RATE = 9600
const DEFAULT_DATA_BITS = 8
const DEFAULT_STOP_BITS = 1
const DEFAULT_PARITY = 'none' as const
const DEFAULT_ENCODING = 'utf8'
const READ_INTERVAL_MS = 10 // 固定10ms读取间隔
const MAX_BUFFER_SIZE = 1024 // 最大缓冲区大小（字节）
const BUFFER_TIMEOUT_MS = 100 // 无换行符时超时输出（毫秒）

interface SerialConnection {
  port: SerialPort
  buffer: Buffer
  timer: NodeJS.Timeout | null
  writeTimeout: number
  encoding: string
  onData: any
  onClose: any
  onLog: any
  lastOutputTime: number // 上次输出时间
  hexDisplayMode: boolean // 是否为HEX显示模式
}

export default class ComClient extends BaseClient {
  serialConnections = new Map<string, SerialConnection>()

  // 处理缓冲区数据，按行分割（buffer 中存储原始 Buffer）
  private processBuffer(connection: SerialConnection, onData: any, onLog: any): void {
    const { buffer } = connection
    if (!buffer || buffer.length === 0) return

    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0')

    // 查找换行符位置
    let lineEnd = -1
    let lineEndingLen = 0  // 换行符字节数

    const crIndex = buffer.indexOf(0x0D)  // \r
    const lfIndex = buffer.indexOf(0x0A)  // \n

    if (crIndex !== -1 && lfIndex === crIndex + 1) {
      // 完整的 \r\n 组合（两个字节连续）
      lineEnd = crIndex
      lineEndingLen = 2
    } else if (lfIndex !== -1) {
      if (lfIndex > 0 && buffer[lfIndex - 1] === 0x0D) {
        // \r\n 分开接收，现在都在 buffer 中了
        lineEnd = lfIndex - 1
        lineEndingLen = 2
      } else {
        // 只有单独的 \n
        lineEnd = lfIndex
        lineEndingLen = 1
      }
    } else if (crIndex !== -1) {
      if (crIndex + 1 < buffer.length && buffer[crIndex + 1] === 0x0A) {
        // \r\n 分开接收
        lineEnd = crIndex
        lineEndingLen = 2
      } else if (crIndex + 1 >= buffer.length) {
        // 只有 \r，后面可能还有 \n，延迟处理
        lineEnd = -1
      } else {
        // 只有单独的 \r
        lineEnd = crIndex
        lineEndingLen = 1
      }
    }

    // 如果找到换行符，或者缓冲区超过最大大小，或者超时
    const now = Date.now()
    const bufferLen = buffer.length
    const shouldForceOutput = bufferLen >= MAX_BUFFER_SIZE || 
      (connection.lastOutputTime > 0 && now - connection.lastOutputTime >= BUFFER_TIMEOUT_MS && bufferLen > 0)

    if (lineEnd !== -1 || shouldForceOutput) {
      if (lineEnd !== -1) {
        // 有换行符，按行输出（不包含换行符本身）
        const line = buffer.subarray(0, lineEnd)
        const remaining = buffer.subarray(lineEnd + lineEndingLen)

        let displayData: string
        if (connection.hexDisplayMode) {
          // HEX显示模式 - 只格式化数据部分，不格式化换行符
          displayData = this.formatHexBuffer(line)
        } else {
          // 字符串显示模式 - 只解码数据部分
          const enc = (connection.encoding || 'utf8') as BufferEncoding
          displayData = line.toString(enc)
        }

        onData?.(displayData)
        onLog?.(`[${timestamp}] ${displayData}`)

        connection.buffer = remaining.length > 0 ? remaining : Buffer.alloc(0)
      } else {
        // 无换行符但超时，强制输出
        let displayData: string
        if (connection.hexDisplayMode) {
          displayData = this.formatHexBuffer(buffer)
        } else {
          displayData = buffer.toString((connection.encoding || 'utf8') as BufferEncoding)
        }
        onData?.(displayData)
        onLog?.(`[${timestamp}] ${displayData}`)
        connection.buffer = Buffer.alloc(0)
      }
      connection.lastOutputTime = now

      // 继续处理剩余数据
      if (connection.buffer && connection.buffer.length > 0) {
        this.processBuffer(connection, onData, onLog)
      }
    }
  }

  // 将 Buffer 格式化为带空格的形式
  private formatHexBuffer(buf: Buffer): string {
    if (!buf || buf.length === 0) return ''
    return buf.toString('hex').match(/.{1,2}/g)?.join(' ') || ''
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
      return { success: false, message: '串口名不能为空' }
    }

    try {
      logger.info(`start to connect serial port: ${comName} @ ${baudRate} (session: ${sessionId})`)
      logger.debug(`dataBits: ${dataBits}, stopBits: ${stopBits}, parity: ${parity}, encoding: ${encoding}, readTimeout: ${readTimeout}`)

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
          logger.info(`serial port opened successfully`)

          const connection: SerialConnection = {
            port,
            buffer: Buffer.alloc(0),
            timer: null,
            writeTimeout: writeTimeout,
            encoding: encoding,
            onData: onData,
            onClose: onClose,
            onLog: onLog,
            lastOutputTime: Date.now(),
            hexDisplayMode: true // 默认使用 HEX 显示模式
          }
          this.serialConnections.set(sessionId, connection)

          // 收集数据到缓冲区
          port.on('data', (data: Buffer) => {
            connection.buffer = Buffer.concat([connection.buffer, data])
          })

          // 使用固定间隔处理数据
          connection.timer = setInterval(() => {
            this.processBuffer(connection, connection.onData, connection.onLog)
          }, READ_INTERVAL_MS)

          port.on('close', () => {
            logger.info(`serial port closed: ${comName}`)
            if (connection.timer) {
              clearInterval(connection.timer)
              connection.timer = null
            }
            // 关闭前输出缓冲区中剩余的数据
            if (connection.buffer && connection.buffer.length > 0) {
              const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0')
              let displayData: string
              if (connection.hexDisplayMode) {
                displayData = this.formatHexBuffer(connection.buffer)
              } else {
                displayData = connection.buffer.toString((connection.encoding || 'utf8') as BufferEncoding)
              }
              connection.onData?.(displayData)
              connection.onLog?.(`[${timestamp}] ${displayData}`)
              connection.buffer = Buffer.alloc(0)
            }
            this.serialConnections.delete(sessionId)
            connection.onClose?.()
          })

          port.on('error', (err: Error) => {
            logger.error(`serial port error: ${err.message}`)
          })

          resolve({ success: true, message: '连接成功', connId: sessionId })
        })

        port.once('error', (err: Error) => {
          logger.error(`serial port open failed: ${err.message}`)
          reject(new Error(err.message || '打开串口失败'))
        })

        port.open((err: Error | null) => {
          if (err) {
            logger.error(`serial port open error: ${err.message}`)
            reject(new Error(err.message || '打开串口失败'))
          }
        })
      })
    } catch (error) {
      console.error(error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '连接失败'
      }
    }
  }

  async send(connId: string, command: string, onComplete: any): Promise<object> {
    const connection = this.serialConnections.get(connId)
    if (!connection) {
      return { success: false, message: '连接不存在' }
    }

    try {
      const dataStr = `[${new Date().toISOString()}] SEND >>>>>>>>>> ${command}`
      // 直接发送前端传来的数据，换行符已在前端根据配置处理
      connection.port.write(command, connection.encoding as BufferEncoding, (err: Error | null | undefined) => {
        if (err) {
          logger.error(`serial write error: ${err.message}`)
          return
        }
        onComplete?.(dataStr)
        logger.info(`send command: ${command}`)
      })

      return { success: true }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '发送命令失败'
      }
    }
  }

  async disconnect(connId: string): Promise<object> {
    const connection = this.serialConnections.get(connId)
    if (connection) {
      logger.info(`disconnect serial port: ${connection.port.path}`)

      // 停止定时器
      if (connection.timer) {
        clearInterval(connection.timer)
        connection.timer = null
      }

      connection.port.close((err: Error | null) => {
        if (err) {
          logger.error(`serial port close error: ${err.message}`)
        }
      })
      this.serialConnections.delete(connId)
    } else {
      console.warn('not find connId:', connId)
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
    hexDisplayMode?: boolean
  }): Promise<object> {
    const connection = this.serialConnections.get(connId)
    if (!connection) {
      return { success: false, message: '连接不存在' }
    }

    const port = connection.port
    const comName = port.path

    // 更新 HEX 显示模式（不需要重开端口）
    if (config.hexDisplayMode !== undefined) {
      connection.hexDisplayMode = config.hexDisplayMode
      logger.info(`update hexDisplayMode: ${config.hexDisplayMode}`)
    }

    // 如果只更新了 hexDisplayMode，直接返回
    if (config.baudRate === undefined && config.dataBits === undefined && 
        config.stopBits === undefined && config.parity === undefined && 
        config.encoding === undefined && config.readTimeout === undefined && 
        config.writeTimeout === undefined && config.rts === undefined && 
        config.dtr === undefined && config.flowControl === undefined) {
      return { success: true, message: '配置更新成功' }
    }

    // 更新串口参数配置
    const newBaudRate = config.baudRate || DEFAULT_BAUD_RATE
    const newDataBits = config.dataBits || DEFAULT_DATA_BITS
    const newStopBits = config.stopBits || DEFAULT_STOP_BITS
    const newParity = config.parity || DEFAULT_PARITY
    const newEncoding = config.encoding || connection.encoding || DEFAULT_ENCODING
    const newFlowControl = config.flowControl || 'none'
    const newRts = config.rts !== undefined ? config.rts : true
    const newDtr = config.dtr !== undefined ? config.dtr : true

    logger.info(`update serial config: ${comName} @ ${newBaudRate}, dataBits: ${newDataBits}, stopBits: ${newStopBits}, parity: ${newParity}, encoding: ${newEncoding}, flowControl: ${newFlowControl}, rts: ${newRts}, dtr: ${newDtr}`)

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
          logger.error(`close port error: ${err.message}`)
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
          logger.info(`serial port reopened successfully with new config`)

          // 更新连接信息
          const newConnection: SerialConnection = {
            port: newPort,
            buffer: Buffer.alloc(0),
            timer: null,
            writeTimeout: config.writeTimeout ?? connection.writeTimeout,
            encoding: newEncoding,
            onData: savedOnData,
            onClose: savedOnClose,
            onLog: connection.onLog,
            lastOutputTime: Date.now(),
            hexDisplayMode: connection.hexDisplayMode
          }
          this.serialConnections.set(connId, newConnection)

          // 收集数据到缓冲区
          newPort.on('data', (data: Buffer) => {
            newConnection.buffer = Buffer.concat([newConnection.buffer, data])
          })

          // 重新启动数据收集定时器
          newConnection.timer = setInterval(() => {
            this.processBuffer(newConnection, newConnection.onData, newConnection.onLog)
          }, READ_INTERVAL_MS)

          newPort.on('close', () => {
            logger.info(`serial port closed after update: ${comName}`)
            if (newConnection.timer) {
              clearInterval(newConnection.timer)
              newConnection.timer = null
            }
            this.serialConnections.delete(connId)
          })

          newPort.on('error', (err: Error) => {
            logger.error(`serial port error after update: ${err.message}`)
          })

          resolve({ success: true, message: '配置更新成功' })
        })

        newPort.once('error', (err: Error) => {
          logger.error(`reopen port error: ${err.message}`)
          // 尝试恢复原来的连接
          this.reopenPort(connId, connection)
          resolve({ success: false, message: err.message || '更新配置失败' })
        })

        newPort.open((err: Error | null) => {
          if (err) {
            logger.error(`open port error: ${err.message}`)
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
          writeTimeout: oldConnection.writeTimeout,
          encoding: encoding,
          onData: oldConnection.onData,
          onClose: oldConnection.onClose,
          onLog: oldConnection.onLog,
          lastOutputTime: Date.now(),
          hexDisplayMode: oldConnection.hexDisplayMode
        }
        this.serialConnections.set(connId, newConnection)

        // 收集数据到缓冲区
        recoveryPort.on('data', (data: Buffer) => {
          newConnection.buffer = Buffer.concat([newConnection.buffer, data])
        })

        newConnection.timer = setInterval(() => {
          this.processBuffer(newConnection, newConnection.onData, newConnection.onLog)
        }, READ_INTERVAL_MS)

        recoveryPort.on('close', () => {
          if (newConnection.timer) {
            clearInterval(newConnection.timer)
            newConnection.timer = null
          }
          this.serialConnections.delete(connId)
        })

        logger.info(`serial port recovered: ${comName} @ ${baudRate}`)
      } else {
        logger.error(`cannot recover serial port: ${err.message}`)
      }
    })
  }
}
