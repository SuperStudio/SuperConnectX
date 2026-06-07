import { SerialPort } from 'serialport'
import logger from '../ipc/IpcAppLogger'
import BaseClient from './BaseClient'
import ConnectionInfo from './ConnectionInfo'
import { BufferLineSplitter } from './BufferLineSplitter'

const DEFAULT_BAUD_RATE = 9600
const DEFAULT_DATA_BITS = 8
const DEFAULT_STOP_BITS = 1
const DEFAULT_PARITY = 'none' as const
const DEFAULT_ENCODING = 'utf8'
const READ_INTERVAL_MS = 10 // 固定10ms读取间隔
const COMMAND_LINE_TERMINATOR = '\r\n'

interface SerialConnection {
  port: SerialPort
  buffer: Buffer
  timer: NodeJS.Timeout | null
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

  // 处理缓冲区数据，按行分割并添加时间戳
  private processBuffer(connection: SerialConnection): void {
    const { buffer, splitter, onData, onLog } = connection
    if (!buffer || buffer.length === 0) return

    const result = splitter.split(buffer)
    connection.buffer = result.remainder

    if (result.count > 0) {
      const timestamp = BufferLineSplitter.timestamp()
      onData?.({ data: result.data, timestamp })
      onLog?.(result.log, timestamp)
    }
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
            receiveHex: info.receiveHex === true,
            splitter: new BufferLineSplitter(encoding, info.receiveHex === true)
          }
          this.serialConnections.set(sessionId, connection)

          // 收集原始 Buffer 数据到缓冲区（不在 data 事件中 toString，避免多字节字符被分割）
          port.on('data', (data: Buffer) => {
            connection.buffer = Buffer.concat([connection.buffer, data])
          })

          // 使用固定间隔处理数据
          connection.timer = setInterval(() => {
            this.processBuffer(connection)
          }, READ_INTERVAL_MS)

          port.on('close', () => {
            logger.info(`serial port closed: ${comName}`)
            if (connection.timer) {
              clearInterval(connection.timer)
              connection.timer = null
            }
            // 关闭前输出缓冲区中剩余的数据
            if (connection.buffer && connection.buffer.length > 0) {
              const timestamp = BufferLineSplitter.timestamp()
              const remainingStr = connection.buffer.toString(encoding as BufferEncoding)
              connection.onData?.({ data: remainingStr, timestamp })
              connection.onLog?.(connection.splitter.toLogLine(remainingStr), timestamp)
              connection.buffer = Buffer.alloc(0)
            }
            this.serialConnections.delete(sessionId)
            connection.onClose?.()
          })

          port.on('error', (err: Error) => {
            logger.error(`serial port error: ${err.message}`)
          })

          resolve({ success: true, message: 'Connected successfully', connId: sessionId })
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
      logger.error('serial connect failed', { comName, baudRate, sessionId, error })
      return {
        success: false,
        message: error instanceof Error ? error.message : '连接失败'
      }
    }
  }

  async send(connId: string, command: string, onComplete: any): Promise<object> {
    const connection = this.serialConnections.get(connId)
    if (!connection) {
      return { success: false, message: 'Connection does not exist' }
    }

    try {
      const dataStr = `[${new Date().toISOString()}] SEND >>>>>>>>>> ${command}`
      const commandWithNewline = command.endsWith(COMMAND_LINE_TERMINATOR) ? command : (command.endsWith('\n') ? command.replace(/\n$/, COMMAND_LINE_TERMINATOR) : command + COMMAND_LINE_TERMINATOR)
      connection.port.write(commandWithNewline, connection.encoding as BufferEncoding, (err: Error | null | undefined) => {
        if (err) {
          logger.error(`serial write error: ${err.message}`)
          return
        }
        onComplete?.(dataStr)
        logger.info(`send command: ${command}`)
      })

      return { success: true }
    } catch (error) {
      logger.error('serial send failed', { connId, command, error })
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

      // 主动断开前移除 close 事件监听器，防止触发 onClose 回调导致重连
      connection.port.removeAllListeners('close')
      connection.port.close((err: Error | null) => {
        if (err) {
          logger.error(`serial port close error: ${err.message}`)
        }
      })
      this.serialConnections.delete(connId)
    } else {
      logger.warn('not find connId for disconnect', { connId })
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
        logger.info(`update serial receiveHex: ${config.receiveHex}, sessionId: ${connId}`)
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
            receiveHex: connection.receiveHex,
            splitter: new BufferLineSplitter(newEncoding, connection.receiveHex)
          }
            this.serialConnections.set(connId, newConnection)

          // 收集数据到缓冲区（Buffer 累积，避免多字节字符被分割）
          newPort.on('data', (data: Buffer) => {
            newConnection.buffer = Buffer.concat([newConnection.buffer, data])
          })

          // 重新启动数据收集定时器
          newConnection.timer = setInterval(() => {
            this.processBuffer(newConnection)
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

          resolve({ success: true, message: 'Configuration updated successfully' })
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
          receiveHex: oldConnection.receiveHex,
          splitter: new BufferLineSplitter(encoding, oldConnection.receiveHex)
        }
        this.serialConnections.set(connId, newConnection)

        // 收集数据到缓冲区（Buffer 累积，避免多字节字符被分割）
        recoveryPort.on('data', (data: Buffer) => {
          newConnection.buffer = Buffer.concat([newConnection.buffer, data])
        })

        newConnection.timer = setInterval(() => {
          this.processBuffer(newConnection)
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

  setReceiveHex(connId: string, receiveHex: boolean): void {
    const connection = this.serialConnections.get(connId)
    if (connection) {
      connection.receiveHex = receiveHex
      connection.splitter.updateReceiveHex(receiveHex)
      logger.info(`setReceiveHex: ${receiveHex} for sessionId: ${connId}`)
    }
  }
}
