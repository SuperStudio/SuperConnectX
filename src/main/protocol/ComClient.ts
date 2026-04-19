import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'
import logger from '../ipc/IpcAppLogger'
import BaseClient from './BaseClient'
import ConnectionInfo from './ConnectionInfo'

const DEFAULT_BAUD_RATE = 9600
const DEFAULT_DATA_BITS = 8
const DEFAULT_STOP_BITS = 1
const DEFAULT_PARITY = 'none' as const

interface SerialConnection {
  port: SerialPort
  parser: ReadlineParser
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
        parity: parity
      })

      const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }))

      return new Promise((resolve) => {
        port.open((err: Error | null) => {
          if (err) {
            logger.error(`serial port open failed: ${err.message}`)
            resolve({
              success: false,
              message: err.message || '打开串口失败'
            })
            return
          }

          logger.info(`serial port opened successfully`)

          const connection: SerialConnection = { port, parser }
          this.serialConnections.set(sessionId, connection)

          parser.on('data', (data: string) => {
            onData?.(data)
          })

          port.on('close', () => {
            logger.info(`serial port closed: ${comName}`)
            this.serialConnections.delete(sessionId)
            onClose?.()
          })

          port.on('error', (err: Error) => {
            logger.error(`serial port error: ${err.message}`)
          })

          resolve({ success: true, message: '连接成功', connId: sessionId })
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
