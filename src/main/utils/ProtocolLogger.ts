import { appendFile, appendFileSync, existsSync, mkdirSync } from 'fs'
import { shell } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import path from 'path'

export default class ProtocolLogger {
  private logDir: string
  private connLogFiles = new Map<number, string>()
  private logCache = new Map<number, string[]>()
  private writeTimer: NodeJS.Timeout | null = null
  private readonly BATCH_WRITE_INTERVAL_MS = 10 * 1000

  constructor() {
    const exePath = app.isPackaged ? app.getPath('exe') : process.cwd()
    const appDir = path.dirname(exePath)
    this.logDir = join(appDir, 'logs')

    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true })
    }

    this.startWriteTimer()
  }

  // 生成高精度时间戳
  getTimeStamp(): string {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}-${String(
      date.getMinutes()
    ).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}-${String(
      date.getMilliseconds()
    ).padStart(3, '0')}`
  }

  // 启动定时写入
  private startWriteTimer(): void {
    this.writeTimer = setInterval(() => {
      this.flushAllLogs(false) // 正常运行时异步写入
    }, this.BATCH_WRITE_INTERVAL_MS)
    if (this.writeTimer.unref) this.writeTimer.unref()
  }

  // 批量写入日志（区分同步/异步）
  private flushAllLogs(isSync: boolean = true): void {
    this.logCache.forEach((logEntries, connId) => {
      if (logEntries.length <= 0) {
        return
      }

      const fileName = this.connLogFiles.get(connId)
      if (!fileName) return

      const logFile = join(this.logDir, fileName)
      const logData = logEntries.join('\n') + '\n'

      try {
        if (isSync) {
          // 退出时同步写入（纯Node.js API，无Electron依赖）
          appendFileSync(logFile, logData, 'utf-8')
        } else {
          // 正常运行时异步写入
          appendFile(logFile, logData, 'utf-8', (err) => {
            if (err) console.error(`异步写入日志失败[connId:${connId}]:`, err)
          })
        }
        this.logCache.set(connId, []) // 清空缓存
      } catch (err) {
        console.error(`写入日志失败[connId:${connId}]:`, err)
      }
    })
  }

  flush(): void {
    if (this.writeTimer) {
      clearInterval(this.writeTimer)
      this.writeTimer = null
    }
    this.flushAllLogs(true)
  }

  createConnLogFile(connId: number, connName: string): string {
    const safeName = connName.replace(/[\\/*?:"<>|]/g, '-')
    const fileName = `${safeName}-${this.getTimeStamp()}.log`
    this.connLogFiles.set(connId, fileName)
    this.logCache.set(connId, [])
    return fileName
  }

  writeToConnLog(data: string, connId: number): void {
    const fileName = this.connLogFiles.get(connId)
    if (!fileName) return

    const currentLogs = this.logCache.get(connId) || []
    const hasNewline = /\r?\n/.test(data)

    if (hasNewline) {
      // 处理包含换行符的情况，拆分后为每行添加时间戳
      const lines = data.split(/\r?\n/)
      const timestamp = this.getTimeStamp()
      const logLines = lines.map((line) => `[${timestamp}] ${line}`)
      currentLogs.push(...logLines)
    } else {
      // 不含换行符，接在上一次数据后面（如果缓存为空则先添加时间戳）
      if (currentLogs.length === 0) {
        currentLogs.push(`[${this.getTimeStamp()}] ${data}`)
      } else {
        // 拼接在最后一条日志的时间戳后面
        const lastLine = currentLogs.pop() || ''
        currentLogs.push(`${lastLine}${data}`)
      }
    }

    this.logCache.set(connId, currentLogs)
  }

  // 连接关闭时清理并刷入日志
  clearConnLogFile(connId: number): void {
    const remainingLogs = this.logCache.get(connId)
    if (remainingLogs && remainingLogs.length > 0) {
      const fileName = this.connLogFiles.get(connId)
      if (fileName) {
        const logFile = join(this.logDir, fileName)
        const logData = remainingLogs.join('\n') + '\n'
        try {
          appendFileSync(logFile, logData, 'utf-8') // 同步写入
        } catch (err) {
          console.error(`关闭连接时刷日志失败:`, err)
        }
      }
    }
    this.connLogFiles.delete(connId)
    this.logCache.delete(connId)
  }

  async openConnLog(connId: number): Promise<{ success: boolean; message: string } | null> {
    try {
      this.flushAllLogs(false)

      const fileName = this.connLogFiles.get(connId)
      if (!fileName) {
        return { success: false, message: '未找到连接日志' }
      }

      const logFilePath = join(this.logDir, fileName)
      if (!existsSync(logFilePath)) {
        await fs.writeFile(logFilePath, '', 'utf-8')
      }

      if (shell && !app.isQuitting) {
        await shell.showItemInFolder(logFilePath)
      }
      return { success: true, message: '' }
    } catch (error) {
      console.error('打开日志失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '打开日志文件失败'
      }
    }
  }

  async openLogDir(): Promise<{ success: boolean; message: string } | null> {
    try {
      this.flushAllLogs(false)

      if (!existsSync(this.logDir)) {
        return { success: false, message: '日志目录不存在' }
      }

      if (shell && !app.isQuitting) {
        await shell.openPath(this.logDir)
      }
      return { success: true, message: '' }
    } catch (error) {
      console.error('打开日志目录失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '打开日志目录失败'
      }
    }
  }
}
