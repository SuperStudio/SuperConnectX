/**
 * WorkerConnector - Worker 模式代理
 *
 * 职责：将 IPC 调用转发给 WorkerPool（薄层，无业务逻辑）
 */
import WorkerPool from '../../pool/WorkerPool'
import ConnectionInfo from '../../protocol/ConnectionInfo'

export default class WorkerConnector {
  private workerPool: WorkerPool

  constructor() {
    this.workerPool = WorkerPool.getInstance()
  }

  setCallbacks(
    onData: (sessionId: string, displayData: string, timestamp: string, isHex: boolean) => void,
    onLog: (sessionId: string, logStr: string, timestamp: string) => void,
    onClose: (sessionId: string) => void
  ): void {
    this.workerPool.setCallbacks(onData, onLog, onClose)
  }

  /**
   * 判断连接是否应该使用 Worker 模式
   * - Telnet：纯 JS 协议，可以线程隔离
   * - COM：serialport 原生模块不支持 worker_threads
   * - FTP：ftp-srv/net.Socket 不兼容 worker_threads
   */
  shouldUseWorker(conn: any, useWorkerMode: boolean): boolean {
    if (!useWorkerMode) return false
    if (conn.connectionType === 'com') return false
    if (conn.connectionType === 'ftp') return false
    return true
  }

  buildConnectInfo(conn: any): ConnectionInfo {
    return {
      host: conn.host,
      port: conn.port,
      username: conn.username,
      password: conn.password,
      sessionId: conn.sessionId,
      comName: conn.comName,
      baudRate: conn.baudRate,
      dataBits: conn.dataBits,
      stopBits: conn.stopBits,
      parity: conn.parity,
      encoding: conn.encoding,
      readTimeout: conn.readTimeout,
      writeTimeout: conn.writeTimeout,
      flowControl: conn.flowControl,
      rts: conn.rts,
      dtr: conn.dtr,
      receiveHex: conn.receiveHex,
      ftpMode: conn.ftpMode,
      ftpDirectory: conn.ftpDirectory,
      ftpPermissions: conn.ftpPermissions
    }
  }

  async startConnection(conn: any): Promise<object> {
    const connInfo = this.buildConnectInfo(conn)
    return await this.workerPool.startConnection(connInfo, conn.connectionType)
  }

  async sendData(conn: any, command: string): Promise<object> {
    return await this.workerPool.sendData(conn.sessionId, conn.connectionType, command)
  }

  async stopConnection(conn: any): Promise<object> {
    return await this.workerPool.stopConnection(conn.sessionId, conn.connectionType)
  }

  async updateConnectionConfig(conn: any, config: any): Promise<object> {
    return await this.workerPool.updateConnectionConfig(conn.sessionId, conn.connectionType, config)
  }

  async shutdown(): Promise<void> {
    await this.workerPool.shutdown()
  }

  getStatus(): object {
    return this.workerPool.getStatus()
  }
}
