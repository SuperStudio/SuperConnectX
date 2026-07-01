/**
 * ConnectionWorker - 在独立的 Worker Thread 中运行单个协议连接
 *
 * 设计原则：1 Connection = 1 Worker
 * - 每个 Worker 只负责一个连接（sessionId）
 * - 拥有独立的协议客户端实例（TelnetClient 或 ComClient）
 * - 数据接收、Buffer 处理、HEX 转换全部在独立线程中完成
 * - 通过 parentPort 与主线程通信，只回传已处理好的数据
 *
 * 注意：Worker 中不能直接访问 Electron API（webContents 等），
 * 所有需要 Electron API 的操作都回传主线程处理。
 */
import { parentPort, workerData } from 'worker_threads'
import ComClient from '../protocol/ComClient'
import TelnetClient from '../protocol/TelnetClient'
import BaseClient from '../protocol/BaseClient'
import ConnectionInfo from '../protocol/ConnectionInfo'

// ===================== 消息类型定义 =====================

interface WorkerMessage {
  type: 'start' | 'send' | 'stop' | 'update-config' | 'shutdown'
  sessionId: string
  connInfo?: ConnectionInfo
  connectionType?: string
  command?: string
  config?: any
  requestId?: string
}

interface WorkerResponse {
  type: 'ready' | 'start-result' | 'data' | 'log' | 'close' | 'send-result' | 'stop-result' | 'update-config-result' | 'error'
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

// ===================== Worker 内部状态 =====================

// 当前连接的唯一客户端实例（每个 Worker 只有一个连接）
let client: BaseClient | null = null
let currentSessionId: string = ''
let currentConnectionType: string = ''
let receiveHex: boolean = false

/**
 * 将响应发送回主线程
 */
function postResponse(resp: WorkerResponse): void {
  parentPort?.postMessage(resp)
}

/**
 * 创建协议客户端实例（每个 Worker 只有一个，按 connectionType 创建）
 * 传入 console 作为 logger，避免 Worker 中引入 Electron 依赖
 */
function getOrCreateClient(connectionType: string): BaseClient | null {
  if (client) {
    // 如果连接类型相同，复用实例
    if (currentConnectionType === connectionType) return client
    // 如果类型不同，先销毁旧实例再创建新的（理论上不应该发生）
    client = null
  }

  switch (connectionType) {
    case 'telnet':
      client = new TelnetClient(console)
      break
    case 'com':
      client = new ComClient(console)
      break
    default:
      return null
  }

  currentConnectionType = connectionType
  return client
}

// ===================== 消息处理器 =====================

/**
 * 处理启动连接
 */
async function handleStart(msg: WorkerMessage): Promise<void> {
  const { sessionId, connInfo, connectionType } = msg
  if (!connInfo || !connectionType) {
    postResponse({
      type: 'start-result',
      sessionId,
      requestId: msg.requestId,
      success: false,
      message: 'Missing connInfo or connectionType'
    })
    return
  }

  // 如果已有连接，先断开
  if (client && currentSessionId) {
    try {
      await client.disconnect(currentSessionId)
    } catch { /* ignore */ }
  }

  const c = getOrCreateClient(connectionType)
  if (!c) {
    postResponse({
      type: 'start-result',
      sessionId,
      requestId: msg.requestId,
      success: false,
      message: `Unknown connection type: ${connectionType}`
    })
    return
  }

  currentSessionId = sessionId
  receiveHex = connInfo.receiveHex === true

  try {
    const result = await c.start(
      connInfo,
      // onData 回调：数据到达时回传主线程（HEX 转换在 Worker 中完成）
      (dataObj: { data: string; timestamp: string; lineTimestamps?: string[] }) => {
        let displayData: string
        const isHex = receiveHex

        if (isHex) {
          let hexResult = ''
          for (let i = 0; i < dataObj.data.length; i++) {
            const hex = dataObj.data.charCodeAt(i).toString(16)
            hexResult += hex.padStart(2, '0') + ' '
          }
          displayData = hexResult.trim()
        } else {
          displayData = dataObj.data
        }

        postResponse({
          type: 'data',
          sessionId,
          displayData,
          timestamp: dataObj.timestamp,
          lineTimestamps: dataObj.lineTimestamps,
          isHex
        })
      },
      // onClose 回调
      () => {
        postResponse({ type: 'close', sessionId })
      },
      // onLog 回调
      (logStr: string, timestamp: string, lineTimestamps?: string[]) => {
        postResponse({ type: 'log', sessionId, logStr, timestamp, lineTimestamps })
      }
    )

    postResponse({
      type: 'start-result',
      sessionId,
      requestId: msg.requestId,
      success: (result as any)?.success ?? false,
      message: (result as any)?.message ?? '',
      connId: sessionId
    })
  } catch (err: any) {
    postResponse({
      type: 'start-result',
      sessionId,
      requestId: msg.requestId,
      success: false,
      message: err?.message || 'Connection failed'
    })
  }
}

/**
 * 处理发送数据
 */
async function handleSend(msg: WorkerMessage): Promise<void> {
  const { sessionId, command } = msg
  if (!client || !command) {
    postResponse({
      type: 'send-result',
      sessionId,
      requestId: msg.requestId,
      success: false,
      message: 'Not connected or missing command'
    })
    return
  }

  try {
    const result = await client.send(sessionId, command, (dataStr: string) => {
      postResponse({ type: 'log', sessionId, logStr: dataStr })
    })

    postResponse({
      type: 'send-result',
      sessionId,
      requestId: msg.requestId,
      success: (result as any)?.success ?? false,
      message: (result as any)?.message ?? ''
    })
  } catch (err: any) {
    postResponse({
      type: 'send-result',
      sessionId,
      requestId: msg.requestId,
      success: false,
      message: err?.message || 'Send failed'
    })
  }
}

/**
 * 处理断开连接
 */
async function handleStop(msg: WorkerMessage): Promise<void> {
  const { sessionId } = msg

  if (client) {
    try {
      await client.disconnect(sessionId)
    } catch { /* ignore */ }
  }

  postResponse({
    type: 'stop-result',
    sessionId,
    requestId: msg.requestId,
    success: true
  })
}

/**
 * 处理更新配置
 */
async function handleUpdateConfig(msg: WorkerMessage): Promise<void> {
  const { sessionId, config } = msg
  if (!config) {
    postResponse({
      type: 'update-config-result',
      sessionId,
      requestId: msg.requestId,
      success: false,
      message: 'Missing config'
    })
    return
  }

  // 动态切换 receiveHex
  if (config.receiveHex !== undefined) {
    receiveHex = config.receiveHex === true || config.receiveHex === 'true'
    client?.setReceiveHex(sessionId, receiveHex)
    postResponse({
      type: 'update-config-result',
      sessionId,
      requestId: msg.requestId,
      success: true,
      message: 'Updated successfully'
    })
    return
  }

  // 动态切换 logTimestamp（在主线程 IpcConnector.logTimestampMap 中处理，Worker 只透传日志数据）
  if (config.logTimestamp !== undefined) {
    // logTimestamp 的实际拼接在主线程回调中完成，此处只确认配置更新
    postResponse({
      type: 'update-config-result',
      sessionId,
      requestId: msg.requestId,
      success: true,
      message: 'Updated successfully'
    })
    return
  }

  // 其他配置更新
  if (!client) {
    postResponse({
      type: 'update-config-result',
      sessionId,
      requestId: msg.requestId,
      success: false,
      message: 'Not connected'
    })
    return
  }

  try {
    const result = await client.updateConfig(sessionId, config)
    postResponse({
      type: 'update-config-result',
      sessionId,
      requestId: msg.requestId,
      success: (result as any)?.success ?? false,
      message: (result as any)?.message ?? ''
    })
  } catch (err: any) {
    postResponse({
      type: 'update-config-result',
      sessionId,
      requestId: msg.requestId,
      success: false,
      message: err?.message || 'Update config failed'
    })
  }
}

// ===================== 消息路由 =====================

parentPort?.on('message', async (msg: WorkerMessage) => {
  switch (msg.type) {
    case 'start':
      await handleStart(msg)
      break
    case 'send':
      await handleSend(msg)
      break
    case 'stop':
      await handleStop(msg)
      break
    case 'update-config':
      await handleUpdateConfig(msg)
      break
    case 'shutdown':
      // 清理连接（不调用 process.exit，让主线程通过 terminate() 回收）
      if (client) {
        try { await client.disconnect(currentSessionId) } catch { /* ignore */ }
      }
      // Worker 会在主线程调用 terminate() 后自动退出
      break
  }
})

// 通知主线程 Worker 已就绪
parentPort?.postMessage({ type: 'ready', sessionId: workerData?.sessionId || '' })
