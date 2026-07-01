import { Telnet } from 'telnet-client'
import BaseClient, { ILogger } from './BaseClient'
import ConnectionInfo from './ConnectionInfo'
import { BufferLineSplitter } from './BufferLineSplitter'

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
  buffer: Buffer
  timer: NodeJS.Timeout | null
  onData: any
  onClose: any
  onLog: any
  splitter: BufferLineSplitter
}

export default class TelnetClient extends BaseClient {
  telnetConnections = new Map<string, Telnet>()
  connectionInfos = new Map<string, TelnetConnectionInfo>()
  telnetConnectionData = new Map<string, TelnetConnection>()

  constructor(logger?: ILogger) {
    super(logger)
  }

  // 处理缓冲区数据，按行分割并添加时间戳
  private processBuffer(sessionId: string): void {
    const connData = this.telnetConnectionData.get(sessionId)
    if (!connData) return

    const { buffer, splitter, onData, onLog } = connData
    if (!buffer || buffer.length === 0) return

    const result = splitter.split(buffer)
    connData.buffer = result.remainder

    if (result.count > 0) {
      const lineTimestamps = BufferLineSplitter.timestampSeries(result.count)
      const timestamp = lineTimestamps[lineTimestamps.length - 1] || BufferLineSplitter.timestamp()
      onData?.({ data: result.data, timestamp, lineTimestamps })
      onLog?.(result.log, timestamp, lineTimestamps)
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

      this.logger.info(`start to connect: ${host}:${port} (session: ${sessionId})`)
      this.logger.debug(JSON.stringify(params))

      await connection.connect(params)
      this.telnetConnections.set(sessionId, connection)
      this.connectionInfos.set(sessionId, { host, port: port || DEFAULT_TELNET_PORT })

      // 存储连接数据对象
      const connData: TelnetConnection = {
        connection,
        buffer: Buffer.alloc(0),
        timer: null,
        onData,
        onClose,
        onLog,
        splitter: new BufferLineSplitter('utf8', false)
      }
      this.telnetConnectionData.set(sessionId, connData)

      // 收集原始 Buffer 数据到缓冲区
      connection.on('data', (data) => {
        const chunk = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8')
        connData.buffer = Buffer.concat([connData.buffer, chunk])
      })

      // 使用固定间隔处理数据
      connData.timer = setInterval(() => {
        this.processBuffer(sessionId)
      }, READ_INTERVAL_MS)

      connection.on('close', () => {
        this.logger.info(`telnet connection closed: ${host}:${port}`)
        if (connData.timer) {
          clearInterval(connData.timer)
          connData.timer = null
        }
        // 关闭前输出缓冲区中剩余的数据
        if (connData.buffer && connData.buffer.length > 0) {
          const timestamp = BufferLineSplitter.timestamp()
          const remainingStr = connData.buffer.toString('utf8')
          const lineCount = remainingStr.split(/\r?\n/).filter((line) => line.trim() !== '').length || 1
          const lineTimestamps = BufferLineSplitter.timestampSeries(lineCount)
          connData.onData?.({ data: remainingStr, timestamp, lineTimestamps })
          connData.onLog?.(remainingStr, timestamp, lineTimestamps)
          connData.buffer = Buffer.alloc(0)
        }
        this.telnetConnections.delete(sessionId)
        this.connectionInfos.delete(sessionId)
        this.telnetConnectionData.delete(sessionId)
        onClose?.()
      })

      this.logger.info(`connect ok`)
      return { success: true, message: 'Connected successfully', connId: sessionId }
    } catch (error) {
      this.logger.error('telnet connect failed', { host, port, sessionId, error })
      return {
        success: false,
        message: error instanceof Error ? error.message : '连接失败'
      }
    }
  }

  async send(connId: string, command: string, onComplete: any): Promise<object> {
    const connection = this.telnetConnections.get(connId)
    if (!connection) {
      return { success: false, message: 'Connection does not exist' }
    }

    try {
      const dataStr = `[${BufferLineSplitter.timestamp()}] SEND >>>>>>>>>> ${command}`
      await connection.send(command + '\n')
      onComplete?.(dataStr)

      this.logger.info(`send command: ${command}`)
      return { success: true }
    } catch (error) {
      this.logger.error('telnet send failed', { connId, command, error })
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
      this.logger.info(`disconnect: ${info?.host}:${info?.port}`)

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
      this.logger.warn('not find connId for disconnect', { connId })
    }
    return { success: true }
  }

  async updateConfig(_connId: string, _config: any): Promise<object> {
    // Telnet 连接不支持运行时参数热更新（host/port 无法动态变更）
    // receiveHex 和 logTimestamp 的切换在主线程 / Worker 的 onData/onLog 回调中处理
    return { success: true, message: 'No config to update for Telnet' }
  }
}
