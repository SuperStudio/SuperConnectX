import { Telnet } from 'telnet-client'
import logger from '../ipc/IpcAppLogger'
import BaseClient from './BaseClient'
import ConnectionInfo from './ConnectionInfo'

const DEFAULT_TELNET_PORT = 23
const DEFAULT_TIMOUT_MS = 10 * 1000
const DEFAULT_TERMINAL_TYPE = 'vt100' /* cmd 中默认常用 vt100 */
const READ_INTERVAL_MS = 10 // 固定10ms读取间隔

interface TelnetConnectionInfo {
  host: string
  port: number
}

interface TelnetConnection {
  connection: Telnet
  buffer: string
  timer: NodeJS.Timeout | null
  onData: any
  onClose: any
  onLog: any
}

export default class TelnetClient extends BaseClient {
  telnetConnections = new Map<string, Telnet>()
  connectionInfos = new Map<string, TelnetConnectionInfo>()
  telnetConnectionData = new Map<string, TelnetConnection>()

  // 生成时间戳：YYYY-MM-DD HH:mm:ss.mmm
  private getTimestamp(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`
  }

  // 处理缓冲区数据，按行分割并添加时间戳
  private processBuffer(sessionId: string): void {
    const connData = this.telnetConnectionData.get(sessionId)
    if (!connData) return

    const { buffer } = connData
    if (!buffer) return

    const timestamp = this.getTimestamp()

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

      if (line) {
        connData.onData?.({
          data: line,
          timestamp: timestamp
        })
        connData.onLog?.(line, timestamp)
      }

      // 清空缓冲区并保存剩余数据
      connData.buffer = remaining
    }
  }

  async start(info: ConnectionInfo, onData: any, onClose: any, onLog: any): Promise<object> {
    const host = info.host
    const port = info.port
    const sessionId = info.sessionId
    const connection = new Telnet()
    try {
      const params = {
        host: host,
        port: port || DEFAULT_TELNET_PORT,
        timeout: DEFAULT_TIMOUT_MS,
        negotiationMandatory: false, // 禁用强制协议协商（很多服务器不支持）
        echoLines: 0, // 禁用回声（避免重复输出）
        terminalType: DEFAULT_TERMINAL_TYPE,
        stripShellPrompt: false // 不剥离shell提示符（避免干扰连接）
      }

      logger.info(`start to connect: ${host}:${port} (session: ${sessionId})`)
      logger.debug(JSON.stringify(params))

      await connection.connect(params)
      this.telnetConnections.set(sessionId, connection)
      this.connectionInfos.set(sessionId, { host, port: port || DEFAULT_TELNET_PORT })

      // 存储连接数据对象
      const connData: TelnetConnection = {
        connection,
        buffer: '',
        timer: null,
        onData,
        onClose,
        onLog
      }
      this.telnetConnectionData.set(sessionId, connData)

      // 收集数据到缓冲区
      connection.on('data', (data) => {
        connData.buffer += String(data)
      })

      // 使用固定间隔处理数据
      connData.timer = setInterval(() => {
        this.processBuffer(sessionId)
      }, READ_INTERVAL_MS)

      connection.on('close', () => {
        logger.info(`telnet connection closed: ${host}:${port}`)
        if (connData.timer) {
          clearInterval(connData.timer)
          connData.timer = null
        }
        // 关闭前输出缓冲区中剩余的数据
        if (connData.buffer) {
          const timestamp = this.getTimestamp()
          connData.onData?.({
            data: connData.buffer,
            timestamp: timestamp
          })
          connData.onLog?.(connData.buffer, timestamp)
          connData.buffer = ''
        }
        this.telnetConnections.delete(sessionId)
        this.connectionInfos.delete(sessionId)
        this.telnetConnectionData.delete(sessionId)
        onClose?.()
      })

      logger.info(`connect ok`)
      return { success: true, message: '连接成功', connId: sessionId }
    } catch (error) {
      logger.error('telnet connect failed', { host, port, sessionId, error })
      return {
        success: false,
        message: error instanceof Error ? error.message : '连接失败'
      }
    }
  }

  async send(connId: string, command: string, onComplete: any): Promise<object> {
    const connection = this.telnetConnections.get(connId)
    if (!connection) {
      return { success: false, message: '连接不存在' }
    }

    try {
      const dataStr = `[${this.getTimestamp()}] SEND >>>>>>>>>> ${command}`
      await connection.send(command + '\n')
      onComplete?.(dataStr)

      logger.info(`send command: ${command}`)
      return { success: true }
    } catch (error) {
      logger.error('telnet send failed', { connId, command, error })
      return {
        success: false,
        message: error instanceof Error ? error.message : '发送命令失败'
      }
    }
  }

  async disconnect(connId: string): Promise<object> {
    const connection = this.telnetConnections.get(connId)
    const info = this.connectionInfos.get(connId)
    const connData = this.telnetConnectionData.get(connId)
    if (connection) {
      logger.info(`disconnect: ${info?.host}:${info?.port}`)

      // 停止定时器
      if (connData?.timer) {
        clearInterval(connData.timer)
        connData.timer = null
      }

      // 主动断开前移除 close 事件监听器，防止触发 onClose 回调导致重连
      connection.removeAllListeners('close')
      connection.destroy()
      this.telnetConnections.delete(connId)
      this.connectionInfos.delete(connId)
      this.telnetConnectionData.delete(connId)
    } else {
      logger.warn('not find connId for disconnect', { connId })
    }
    return { success: true }
  }
}
