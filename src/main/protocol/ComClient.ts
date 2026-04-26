import { SerialPort } from 'serialport'
import logger from '../ipc/IpcAppLogger'
import BaseClient from './BaseClient'
import ConnectionInfo from './ConnectionInfo'

const DEFAULT_BAUD_RATE = 9600
const DEFAULT_DATA_BITS = 8
const DEFAULT_STOP_BITS = 1
const DEFAULT_PARITY = 'none' as const
const DEFAULT_ENCODING = 'utf8'
const READ_INTERVAL_MS = 20 // 固定20ms读取间隔

interface SerialConnection {
  port: SerialPort
  buffer: string
  timer: NodeJS.Timeout | null
  writeTimeout: number
  encoding: string
  onData: any
  onClose: any
}

export default class ComClient extends BaseClient {
  serialConnections = new Map<string, SerialConnection>()

  // 处理缓冲区数据，按行分割并添加时间戳
  private processBuffer(connection: SerialConnection, onData: any): void {
    const { buffer } = connection
    if (!buffer) return

    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0')

    // 先查找 \r\n
    let lineEnd = buffer.indexOf('\r\n')
    let lineEnding = '\r\n'

    // 如果没找到 \r\n，查找 \r 或 \n
    if (lineEnd === -1) {
      lineEnd = buffer.indexOf('\r')
      lineEnding = '\r'
      if (lineEnd === -1) {
        lineEnd = buffer.indexOf('\n')
        lineEnding = '\n'
      }
    }

    // 如果找到换行符
    if (lineEnd !== -1) {
      const line = buffer.substring(0, lineEnd)
      const remaining = buffer.substring(lineEnd + lineEnding.length)

      // 添加时间戳输出整行
      if (line) {
        onData?.(`[${timestamp}] ${line}\n`)
      }

      // 清空缓冲区并保存剩余数据
      connection.buffer = remaining
    }
  }

  async start(info: ConnectionInfo, onData: any, onClose: any): Promise<object> {
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
            buffer: '',
            timer: null,
            writeTimeout: writeTimeout,
            encoding: encoding,
            onData: onData,
            onClose: onClose
          }
          this.serialConnections.set(sessionId, connection)

          // 收集数据到缓冲区
          port.on('data', (data: Buffer) => {
            connection.buffer += data.toString()
          })

          // 使用固定间隔处理数据
          connection.timer = setInterval(() => {
            this.processBuffer(connection, connection.onData)
          }, READ_INTERVAL_MS)

          port.on('close', () => {
            logger.info(`serial port closed: ${comName}`)
            if (connection.timer) {
              clearInterval(connection.timer)
              connection.timer = null
            }
            // 关闭前输出缓冲区中剩余的数据
            if (connection.buffer) {
              const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0')
              connection.onData?.(`[${timestamp}] ${connection.buffer}\n`)
              connection.buffer = ''
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
      const commandWithNewline = command.endsWith('\n') ? command : command + '\n'
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
  }): Promise<object> {
    const connection = this.serialConnections.get(connId)
    if (!connection) {
      return { success: false, message: '连接不存在' }
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
            buffer: '',
            timer: null,
            writeTimeout: config.writeTimeout ?? connection.writeTimeout,
            encoding: newEncoding,
            onData: savedOnData,
            onClose: savedOnClose
          }
            this.serialConnections.set(connId, newConnection)

          // 收集数据到缓冲区
          newPort.on('data', (data: Buffer) => {
            newConnection.buffer += data.toString()
          })

          // 重新启动数据收集定时器
          newConnection.timer = setInterval(() => {
            this.processBuffer(newConnection, newConnection.onData)
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
          buffer: '',
          timer: null,
          writeTimeout: oldConnection.writeTimeout,
          encoding: encoding,
          onData: oldConnection.onData,
          onClose: oldConnection.onClose
        }
        this.serialConnections.set(connId, newConnection)

        // 收集数据到缓冲区
        recoveryPort.on('data', (data: Buffer) => {
          newConnection.buffer += data.toString()
        })

        newConnection.timer = setInterval(() => {
          this.processBuffer(newConnection, newConnection.onData)
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
