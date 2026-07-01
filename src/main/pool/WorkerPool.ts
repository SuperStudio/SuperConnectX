/**
 * WorkerPool - 管理 Worker Thread 池
 *
 * 设计原则：1 Connection = 1 Worker
 * - 每个连接创建独立的 Worker 线程
 * - 每个 Worker 只负责一个连接（一个 sessionId）
 * - 连接断开后 Worker 自动终止回收
 * - 通过 sessionId 路由消息到对应 Worker
 *
 * 职责：
 * 1. 创建和销毁 Worker 线程（按需创建，用完即回收）
 * 2. 路由主线程和 Worker 之间的消息
 * 3. 健康监控和崩溃恢复
 */
import { Worker } from 'worker_threads'
import path from 'path'
import logger from '../ipc/IpcAppLogger'

// ===================== 消息类型定义 =====================

export interface WorkerToMainMessage {
  type: 'ready' | 'data' | 'log' | 'close' | 'start-result' | 'send-result' | 'stop-result' | 'update-config-result' | 'error'
  sessionId: string
  requestId?: string
  success?: boolean
  message?: string
  connId?: string
  displayData?: string
  timestamp?: string
  lineTimestamps?: string[]
  isHex?: boolean
  logStr?: string
  error?: string
}

export interface MainToWorkerMessage {
  type: 'start' | 'send' | 'stop' | 'update-config' | 'shutdown'
  sessionId: string
  connInfo?: any
  connectionType?: string
  command?: string
  config?: any
  requestId?: string
}

interface WorkerEntry {
  worker: Worker
  sessionId: string
  alive: boolean
  pendingRequests: Map<string, {
    resolve: (value: any) => void
    reject: (reason: any) => void
    timer: NodeJS.Timeout
  }>
}

export default class WorkerPool {
  private static sInstance: WorkerPool

  // sessionId -> WorkerEntry 映射（每个连接一个 Worker）
  private workerMap = new Map<string, WorkerEntry>()

  private requestCounter: number = 0

  // 全局回调（所有 Worker 的数据/日志/关闭事件都通过这里通知外部）
  private onDataCallback: ((sessionId: string, displayData: string, timestamp: string, isHex: boolean, lineTimestamps?: string[]) => void) | null = null
  private onLogCallback: ((sessionId: string, logStr: string, timestamp: string, lineTimestamps?: string[]) => void) | null = null
  private onCloseCallback: ((sessionId: string) => void) | null = null

  private constructor() {
    logger.info('[WorkerPool] Initialized (1 Connection = 1 Worker)')
  }

  static getInstance(): WorkerPool {
    if (!WorkerPool.sInstance) {
      WorkerPool.sInstance = new WorkerPool()
    }
    return WorkerPool.sInstance
  }

  /**
   * 设置全局回调
   */
  setCallbacks(
    onData: (sessionId: string, displayData: string, timestamp: string, isHex: boolean, lineTimestamps?: string[]) => void,
    onLog: (sessionId: string, logStr: string, timestamp: string, lineTimestamps?: string[]) => void,
    onClose: (sessionId: string) => void
  ): void {
    this.onDataCallback = onData
    this.onLogCallback = onLog
    this.onCloseCallback = onClose
  }

  /**
   * 获取 Worker 脚本路径
   */
  private getWorkerPath(): string {
    return path.join(__dirname, 'workers', 'ConnectionWorker.js')
  }

  /**
   * 为指定 sessionId 创建独立 Worker
   */
  private createWorker(sessionId: string): WorkerEntry {
    const workerPath = this.getWorkerPath()
    logger.info(`[WorkerPool] Creating Worker for session: ${sessionId}`)

    const worker = new Worker(workerPath, {
      workerData: { sessionId }
    })

    const entry: WorkerEntry = {
      worker,
      sessionId,
      alive: true,
      pendingRequests: new Map()
    }

    // 处理 Worker 发来的消息
    worker.on('message', (msg: WorkerToMainMessage) => {
      this.handleWorkerMessage(entry, msg)
    })

    // 处理 Worker 错误
    worker.on('error', (err: Error) => {
      logger.error(`[WorkerPool] Worker [${sessionId}] error:`, err.message)
      entry.alive = false
      this.rejectAllPending(entry, new Error(`Worker crashed`))
    })

    // 处理 Worker 退出
    worker.on('exit', (code: number) => {
      logger.info(`[WorkerPool] Worker [${sessionId}] exited with code ${code}`)
      entry.alive = false

      // 如果 Worker 异常退出（非主动 disconnect），通知外部连接已断开
      if (this.workerMap.has(sessionId)) {
        this.onCloseCallback?.(sessionId)
      }

      this.rejectAllPending(entry, new Error(`Worker exited`))
      this.workerMap.delete(sessionId)
    })

    this.workerMap.set(sessionId, entry)
    return entry
  }

  /**
   * 处理 Worker 发来的消息
   */
  private handleWorkerMessage(entry: WorkerEntry, msg: WorkerToMainMessage): void {
    switch (msg.type) {
      case 'ready':
        logger.info(`[WorkerPool] Worker [${entry.sessionId}] is ready`)
        break

      case 'data':
        if (msg.sessionId && msg.displayData !== undefined) {
          this.onDataCallback?.(
            msg.sessionId,
            msg.displayData,
            msg.timestamp || '',
            msg.isHex || false,
            msg.lineTimestamps
          )
        }
        break

      case 'log':
        if (msg.sessionId && msg.logStr !== undefined) {
          this.onLogCallback?.(
            msg.sessionId,
            msg.logStr,
            msg.timestamp || '',
            msg.lineTimestamps
          )
        }
        break

      case 'close':
        if (msg.sessionId) {
          // 连接关闭后，终止 Worker 回收资源
          this.terminateWorker(msg.sessionId)
          this.onCloseCallback?.(msg.sessionId)
        }
        break

      case 'start-result':
      case 'send-result':
      case 'stop-result':
      case 'update-config-result':
        // 处理请求响应
        if (msg.requestId) {
          const pending = entry.pendingRequests.get(msg.requestId)
          if (pending) {
            clearTimeout(pending.timer)
            entry.pendingRequests.delete(msg.requestId)
            pending.resolve(msg)
          }
        }
        break

      case 'error':
        logger.error(`[WorkerPool] Worker [${entry.sessionId}] reported error:`, msg.error)
        break
    }
  }

  /**
   * 拒绝所有 pending 请求
   */
  private rejectAllPending(entry: WorkerEntry, reason: Error): void {
    for (const [_, pending] of entry.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(reason)
    }
    entry.pendingRequests.clear()
  }

  /**
   * 生成唯一请求 ID
   */
  private generateRequestId(): string {
    return `req_${++this.requestCounter}_${Date.now()}`
  }

  /**
   * 发送消息到指定 sessionId 的 Worker 并等待响应
   */
  private async sendToWorker(
    sessionId: string,
    msg: MainToWorkerMessage,
    timeoutMs: number = 30000
  ): Promise<any> {
    const entry = this.workerMap.get(sessionId)
    if (!entry || !entry.alive) {
      throw new Error(`Worker for session ${sessionId} not found or not alive`)
    }

    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId()
      msg.requestId = requestId

      const timer = setTimeout(() => {
        entry.pendingRequests.delete(requestId)
        reject(new Error(`Request timeout: ${msg.type} (sessionId: ${sessionId})`))
      }, timeoutMs)

      entry.pendingRequests.set(requestId, { resolve, reject, timer })
      entry.worker.postMessage(msg)
    })
  }

  /**
   * 终止并回收 Worker
   */
  private async terminateWorker(sessionId: string): Promise<void> {
    const entry = this.workerMap.get(sessionId)
    if (!entry) return

    if (entry.alive) {
      try {
        entry.worker.postMessage({ type: 'shutdown', sessionId })
        // 给 Worker 一点时间清理
        await new Promise((resolve) => setTimeout(resolve, 200))
        await entry.worker.terminate()
      } catch { /* ignore */ }
    }

    this.workerMap.delete(sessionId)
    logger.info(`[WorkerPool] Worker [${sessionId}] terminated`)
  }

  // ==================== 对外接口 ====================

  /**
   * 创建新连接（创建独立 Worker）
   */
  async startConnection(connInfo: any, connectionType: string): Promise<{ success: boolean; message?: string; connId?: string }> {
    const sessionId = connInfo.sessionId

    // 如果已有同 sessionId 的 Worker，先清理
    if (this.workerMap.has(sessionId)) {
      await this.terminateWorker(sessionId)
    }

    const entry = this.createWorker(sessionId)

    // 等待 Worker ready（带超时保护）
    try {
      await new Promise<void>((resolve, reject) => {
        const onReady = (msg: WorkerToMainMessage) => {
          if (msg.type === 'ready' && msg.sessionId === sessionId) {
            entry.worker.off('message', onReady)
            entry.worker.off('error', onError)
            entry.worker.off('exit', onExit)
            resolve()
          }
        }
        const onError = (err: Error) => {
          entry.worker.off('message', onReady)
          entry.worker.off('error', onError)
          entry.worker.off('exit', onExit)
          reject(new Error(`Worker error before ready: ${err.message}`))
        }
        const onExit = (code: number) => {
          entry.worker.off('message', onReady)
          entry.worker.off('error', onError)
          entry.worker.off('exit', onExit)
          reject(new Error(`Worker exited with code ${code} before ready`))
        }
        entry.worker.on('message', onReady)
        entry.worker.once('error', onError)
        entry.worker.once('exit', onExit)
      })
    } catch (err: any) {
      logger.error(`[WorkerPool] Worker [${sessionId}] failed to become ready:`, err.message)
      this.workerMap.delete(sessionId)
      return { success: false, message: err.message }
    }

    logger.info(`[WorkerPool] Starting connection ${sessionId} in dedicated Worker`)

    try {
      const result = await this.sendToWorker(sessionId, {
        type: 'start',
        sessionId,
        connInfo,
        connectionType
      })

      if (!result.success) {
        // 启动失败，回收 Worker
        await this.terminateWorker(sessionId)
      }

      return {
        success: result.success,
        message: result.message,
        connId: result.connId
      }
    } catch (err: any) {
      logger.error(`[WorkerPool] startConnection failed:`, err.message)
      await this.terminateWorker(sessionId)
      return { success: false, message: err.message }
    }
  }

  /**
   * 发送数据到指定连接
   */
  async sendData(sessionId: string, _connectionType: string, command: string): Promise<{ success: boolean; message?: string }> {
    try {
      const result = await this.sendToWorker(sessionId, {
        type: 'send',
        sessionId,
        command
      })

      return {
        success: result.success,
        message: result.message
      }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  }

  /**
   * 断开连接（终止 Worker）
   */
  async stopConnection(sessionId: string, _connectionType: string): Promise<{ success: boolean; message?: string }> {
    // 先通知 Worker 主动断开
    try {
      await this.sendToWorker(sessionId, {
        type: 'stop',
        sessionId
      }, 5000) // 断开超时设为 5 秒
    } catch {
      // 超时或失败都继续 terminate
    }

    await this.terminateWorker(sessionId)
    return { success: true }
  }

  /**
   * 更新连接配置
   */
  async updateConnectionConfig(
    sessionId: string,
    _connectionType: string,
    config: any
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const result = await this.sendToWorker(sessionId, {
        type: 'update-config',
        sessionId,
        config
      })

      return {
        success: result.success,
        message: result.message
      }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  }

  /**
   * 关闭所有 Worker
   */
  async shutdown(): Promise<void> {
    logger.info(`[WorkerPool] Shutting down ${this.workerMap.size} workers...`)

    const sessionIds = Array.from(this.workerMap.keys())
    for (const sessionId of sessionIds) {
      await this.terminateWorker(sessionId)
    }

    logger.info('[WorkerPool] All workers shut down')
  }

  /**
   * 获取当前池状态（调试用）
   */
  getStatus(): { workerCount: number; sessions: { sessionId: string; alive: boolean }[] } {
    const sessions: { sessionId: string; alive: boolean }[] = []
    this.workerMap.forEach((entry, sessionId) => {
      sessions.push({ sessionId, alive: entry.alive })
    })
    return {
      workerCount: this.workerMap.size,
      sessions
    }
  }
}
