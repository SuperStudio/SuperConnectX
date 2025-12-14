import { Telnet } from 'telnet-client'

const DEFAULT_TELNET_PORT = 23
const DEFAULT_TIMOUT_MS = 10 * 1000
const DEFAULT_TERMINAL_TYPE = 'vt100' /* cmd 中默认常用 vt100 */

export default class TelnetClient {
  telnetConnections = new Map<number, Telnet>()

  constructor() {}

  async start(host, port, id, onData, onClose) {
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

      await connection.connect(params)
      this.telnetConnections.set(id, connection)
      connection.on('data', (data) => onData?.(String(data)))
      connection.on('close', () => {
        this.telnetConnections.delete(id)
        onClose?.()
      })

      return { success: true, message: '连接成功', connId: id }
    } catch (error) {
      console.error(error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '连接失败'
      }
    }
  }

  async send(connId, command, onComplete) {
    const connection = this.telnetConnections.get(connId)
    if (!connection) {
      return { success: false, message: '连接不存在' }
    }

    try {
      const dataStr = `[${new Date().toISOString()}] SEND >>>>>>>>>> ${command}`
      await connection.send(command + '\n')
      onComplete?.(dataStr)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '发送命令失败'
      }
    }
  }

  async disconnect(connId) {
    const connection = this.telnetConnections.get(connId)
    if (connection) {
      console.warn('start end connection', connId)
      connection.destroy()
      this.telnetConnections.delete(connId)
    } else {
      console.warn('not find connId:', connId)
    }
    return { success: true }
  }
}
