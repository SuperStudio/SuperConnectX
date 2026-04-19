import { SerialPort } from 'serialport'
import logger from '../ipc/IpcAppLogger'
import BaseClient from './BaseClient'
import ConnectionInfo from './ConnectionInfo'

const DEFAULT_BAUD_RATE = 9600
const DEFAULT_DATA_BITS = 8
const DEFAULT_STOP_BITS = 1
const DEFAULT_PARITY = 'none' as const

interface SerialConnection {
  port: SerialPort
}

export default class ComClient extends BaseClient {
  serialConnections = new Map<string, SerialConnection>()

  async start(info: ConnectionInfo, onData: any, onClose: any): Promise<object> {
    const comName = info.comName
    const baudRate = info.baudRate || DEFAULT_BAUD_RATE
    const dataBits = info.dataBits || DEFAULT_DATA_BITS
    const stopBits = info.stopBits || DEFAULT_STOP_BITS
    const parity = info.parity || DEFAULT_PARITY
    const sessionId = info.sessionId

    if (!comName) {
      return { success: false, message: '串口名不能为空' }
    }

    try {
      logger.info(`start to connect serial port: ${comName} @ ${baudRate} (session: ${sessionId})`)
      logger.debug(`dataBits: ${dataBits}, stopBits: ${stopBits}, parity: ${parity}`)

      const port = new SerialPort({
        path: comName,
        baudRate: baudRate,
        dataBits: dataBits,
        stopBits: stopBits,
        parity: parity,
        autoOpen: false
      })

      return new Promise((resolve, reject) => {
        // 使用事件监听方式
        port.once('open', () => {
          logger.info(`serial port opened successfully`)

          const connection: SerialConnection = { port }
          this.serialConnections.set(sessionId, connection)

          // 直接监听串口数据，不使用 ReadlineParser
          port.on('data', (data: Buffer) => {
            const dataStr = data.toString('utf8')
            logger.debug(`ComClient recv data: "${dataStr}", length: ${data.length}`)
            onData?.(dataStr)
          })

          port.on('close', () => {
            logger.info(`serial port closed: ${comName}`)
            this.serialConnections.delete(sessionId)
            onClose?.()
          })

          port.on('error', (err: Error) => {
            logger.error(`serial port error: ${err.message}`)
          })

          const result = { success: true, message: '连接成功', connId: sessionId }
          logger.info(`ComClient about to resolve: ${JSON.stringify(result)}`)
          resolve(result)
          logger.info(`ComClient resolve called`)
        })

        port.once('error', (err: Error) => {
          logger.error(`serial port open failed: ${err.message}`)
          reject({
            success: false,
            message: err.message || '打开串口失败'
          })
        })

        // 打开串口
        port.open((err: Error | null) => {
          if (err) {
            logger.error(`serial port open error: ${err.message}`)
            reject({
              success: false,
              message: err.message || '打开串口失败'
            })
          }
          // 如果成功，'open' 事件会被触发，resolve 会在那里调用
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
      connection.port.write(commandWithNewline, (err: Error | null | undefined) => {
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
}
