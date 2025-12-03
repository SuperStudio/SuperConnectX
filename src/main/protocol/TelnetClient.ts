import { Telnet } from 'telnet-client'

export default class TelnetClient {
  // 存储活跃的Telnet连接
  telnetConnections = new Map<number, Telnet>()

  constructor() {}

  async start(host, port, id, onData, onClose) {
    const connection = new Telnet()
    try {
      const params = {
        host: host,
        port: port || 23,
        timeout: 10000, // 10秒超时（必加！）
        negotiationMandatory: false, // 禁用强制协议协商（很多服务器不支持）
        echoLines: 0, // 禁用回声（避免重复输出）
        terminalType: 'vt100', // 终端类型（cmd 中默认常用 vt100）
        stripShellPrompt: false // 不剥离shell提示符（避免干扰连接）
      }

      await connection.connect(params) // 现在超时后会抛出错误，不会一直卡着
      // 存储连接引用
      this.telnetConnections.set(id, connection)
      // 监听数据事件并转发到渲染进程
      connection.on('data', (data) => {
        const dataStr = `[${new Date().toISOString()}] ${data}`
        onData?.(dataStr)
      })

      // 监听连接关闭事件
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
    console.log('enter telnet-disconnect connId:', connId)
    console.log('all connection id: ', Array.from(this.telnetConnections.keys()))
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
