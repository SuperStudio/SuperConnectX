import { appendFile, appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'fs'
import { shell, app } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { getAppDataDir } from './AppDir'

export interface LogSplitCallback {
  (connId: string, oldFileName: string, newFileName: string): void
}

export default class ProtocolLogger {
  private logDir: string
  private logDirPattern: string = '' // 目录模板（用户设置的原始模板）
  private defaultLogDir: string // 默认目录（程序目录/logs）
  private connLogFiles = new Map<string, string>()
  private connLogDirs = new Map<string, string>() // 每个连接解析后的日志目录
  private connLogIndexes = new Map<string, number>()
  private connLogNames = new Map<string, string>() // 保存原始连接名
  private connLogRemarks = new Map<string, string>() // 保存备注名
  private logCache = new Map<string, string[]>()
  private currentFileSizes = new Map<string, number>()
  private logSplitCallback: LogSplitCallback | null = null
  private writeTimer: NodeJS.Timeout | null = null
  private readonly BATCH_WRITE_INTERVAL_MS = 10 * 1000
  private logSplitSizeMB: number = 20 // 默认 20MB
  private enableLogStorage: boolean = true // 是否启用日志存储
  private logFileNamePattern: string = '%C-%Y-%M-%D-%hh-%mm-%ss' // 文件名模板

  constructor() {
    // 智能路径：exe 同目录（非系统盘有权限）或 userData（回退）
    this.defaultLogDir = join(getAppDataDir(), 'logs')
    this.logDir = this.defaultLogDir

    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true })
    }

    this.startWriteTimer()
  }

  // 设置日志分片回调
  setLogSplitCallback(callback: LogSplitCallback | null): void {
    this.logSplitCallback = callback
  }

  // 设置日志分片大小（MB）
  setLogSplitSize(sizeMB: number): void {
    this.logSplitSizeMB = sizeMB
  }

  // 设置是否启用日志存储（运行时生效）
  setEnableLogStorage(enabled: boolean): void {
    this.enableLogStorage = enabled
  }

  // 获取日志存储启用状态
  getEnableLogStorage(): boolean {
    return this.enableLogStorage
  }

  // 设置日志目录模板（运行时生效）
  // dirPath 支持与文件名相同的占位符，在连接建立时解析
  setLogDir(dirPath: string): void {
    if (dirPath) {
      this.logDirPattern = dirPath
    } else {
      this.logDirPattern = ''
      this.logDir = this.defaultLogDir
      this.ensureDir(this.logDir)
    }
  }

  // 获取日志目录
  getLogDir(): string {
    return this.logDir
  }

  // 获取某个连接的日志目录
  private getConnLogDir(connId: string): string {
    return this.connLogDirs.get(connId) || this.defaultLogDir
  }

  // 根据模板和日期解析目录名
  private resolveDirName(connName: string, remark?: string): string {
    if (!this.logDirPattern) {
      return this.defaultLogDir
    }

    const date = new Date()
    const Y = String(date.getFullYear())
    const M = String(date.getMonth() + 1).padStart(2, '0')
    const D = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    const s = String(date.getSeconds()).padStart(2, '0')
    const f = String(date.getMilliseconds()).padStart(3, '0')

    let result = this.logDirPattern
      .replace(/%C/g, connName)
      .replace(/%R/g, remark || '')
      .replace(/%Y/g, Y)
      .replace(/%M/g, M)
      .replace(/%D/g, D)
      .replace(/%h/g, h)
      .replace(/%m/g, m)
      .replace(/%s/g, s)
      .replace(/%f/g, f)
      // 不补零版本
      .replace(/%MM/g, String(date.getMonth() + 1))
      .replace(/%DD/g, String(date.getDate()))
      .replace(/%hh/g, String(date.getHours()))
      .replace(/%mm/g, String(date.getMinutes()))
      .replace(/%ss/g, String(date.getSeconds()))
      .replace(/%fff/g, String(date.getMilliseconds()))

    // 替换非法文件名字符（保留 \ / : 作为路径分隔符和盘符）
    return result.replace(/[*?"<>|]/g, '-')
  }

  // 确保目录存在
  private ensureDir(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
    }
  }

  // 设置日志文件名模板
  setLogFileName(pattern: string): void {
    if (pattern) {
      this.logFileNamePattern = pattern
    }
  }

  // 生成高精度时间戳
  getFileTimeStamp(): string {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}-${String(
      date.getMinutes()
    ).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}-${String(
      date.getMilliseconds()
    ).padStart(3, '0')}`
  }

  getTimeStamp(): string {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
      date.getMinutes()
    ).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}.${String(
      date.getMilliseconds()
    ).padStart(3, '0')}`
  }

  // 启动定时写入
  private startWriteTimer(): void {
    this.writeTimer = setInterval(() => {
      this.flushAllLogs(false) // 正常运行时异步写入，不阻塞事件循环
    }, this.BATCH_WRITE_INTERVAL_MS)
    if (this.writeTimer.unref) this.writeTimer.unref()
  }

  // 检查并处理日志分片
  private checkAndSplitLog(connId: string): string {
    const fileName = this.connLogFiles.get(connId)
    if (!fileName) return fileName || ''

    const logFile = join(this.getConnLogDir(connId), fileName)
    
    // 获取当前文件大小
    let currentSize = this.currentFileSizes.get(connId) || 0
    
    if (existsSync(logFile)) {
      try {
        const stats = statSync(logFile)
        currentSize = stats.size
      } catch (err) {
        console.error(`Failed to get log file size:`, err)
      }
    }

    // 如果超过阈值，创建新文件
    const maxSizeBytes = this.logSplitSizeMB * 1024 * 1024
    if (currentSize >= maxSizeBytes) {
      const oldFileName = fileName
      const index = (this.connLogIndexes.get(connId) || 0) + 1
      this.connLogIndexes.set(connId, index)

      // 使用保存的原始连接名和备注生成新文件名
      const connName = this.connLogNames.get(connId) || 'unknown'
      const remark = this.connLogRemarks.get(connId)
      const newFileName = `${this.resolveFileName(connName, remark)}-${index}.log`
      this.connLogFiles.set(connId, newFileName)
      this.currentFileSizes.set(connId, 0)

      // 触发分片回调
      if (this.logSplitCallback) {
        this.logSplitCallback(connId, oldFileName, newFileName)
      }

      return newFileName
    }

    return fileName
  }

  // 批量写入日志（默认异步，isSync=true 时同步写入）
  private flushAllLogs(isSync: boolean = false): void {
    this.logCache.forEach((logEntries, connId) => {
      if (logEntries.length <= 0) {
        return
      }

      // 检查是否需要分片
      this.checkAndSplitLog(connId)

      const fileName = this.connLogFiles.get(connId)
      if (!fileName) return

      const logFile = join(this.getConnLogDir(connId), fileName)
      const logData = logEntries.join('\n') + '\n'

      try {
        if (isSync) {
          // 退出时同步写入
          appendFileSync(logFile, logData, 'utf-8')
          const stats = statSync(logFile)
          this.currentFileSizes.set(connId, stats.size)
        } else {
          // 正常运行时异步写入（不阻塞事件循环）
          appendFile(logFile, logData, 'utf-8', (err) => {
            if (err) console.error(`Async write log failed [connId:${connId}]:`, err)
            else {
              try {
                const stats = statSync(logFile)
                this.currentFileSizes.set(connId, stats.size)
              } catch { /* ignore */ }
            }
          })
        }
        this.logCache.set(connId, []) // 清空缓存
      } catch (err) {
        console.error(`Write log failed [connId:${connId}]:`, err)
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

  // 根据模板和日期生成文件名
  private resolveFileName(connName: string, remark?: string): string {
    const date = new Date()
    const Y = String(date.getFullYear())
    const M = String(date.getMonth() + 1).padStart(2, '0')
    const D = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    const s = String(date.getSeconds()).padStart(2, '0')
    const f = String(date.getMilliseconds()).padStart(3, '0')

    let result = this.logFileNamePattern
      .replace(/%C/g, connName)
      .replace(/%R/g, remark || '')
      .replace(/%Y/g, Y)
      .replace(/%M/g, M)
      .replace(/%D/g, D)
      .replace(/%h/g, h)
      .replace(/%m/g, m)
      .replace(/%s/g, s)
      .replace(/%f/g, f)
      // 不补零版本
      .replace(/%MM/g, String(date.getMonth() + 1))
      .replace(/%DD/g, String(date.getDate()))
      .replace(/%hh/g, String(date.getHours()))
      .replace(/%mm/g, String(date.getMinutes()))
      .replace(/%ss/g, String(date.getSeconds()))
      .replace(/%fff/g, String(date.getMilliseconds()))

    // 替换非法文件名字符（保留 \ 和 / 作为路径分隔符）
    return result.replace(/[*?:"<>|]/g, '-')
  }

  createConnLogFile(connId: string, connName: string, remark?: string): string {
    if (!this.enableLogStorage) {
      return ''
    }
    // 解析目录模板，创建对应的目录
    const resolvedDir = this.resolveDirName(connName, remark)
    this.ensureDir(resolvedDir)
    this.connLogDirs.set(connId, resolvedDir)
    // 同时更新全局 logDir（用于 openLogDir 等无连接上下文的操作）
    this.logDir = resolvedDir

    const fileName = `${this.resolveFileName(connName, remark)}.log`
    this.connLogFiles.set(connId, fileName)
    this.connLogIndexes.set(connId, 0)
    this.connLogNames.set(connId, connName) // 保存原始连接名
    if (remark) {
      this.connLogRemarks.set(connId, remark)
    }
    this.logCache.set(connId, [])
    this.currentFileSizes.set(connId, 0)

    // 连接时立即创建空日志文件，避免刚连接时点击打开日志提示文件不存在
    const logFilePath = join(resolvedDir, fileName)
    if (!existsSync(logFilePath)) {
      writeFileSync(logFilePath, '', 'utf-8')
    }

    return fileName
  }

  writeToConnLog(data: string, connId: string): void {
    if (!this.enableLogStorage) return
    const fileName = this.connLogFiles.get(connId)
    if (!fileName) return

    const currentLogs = this.logCache.get(connId) || []
    const timestamp = this.getTimeStamp()

    // 先拆分数据，每行作为独立项，过滤空行
    const lines = data.split(/\r?\n/).filter((line) => line.trim() !== '')
    for (const line of lines) {
      currentLogs.push(`[${timestamp}] ${line}`)
    }

    this.logCache.set(connId, currentLogs)
  }

  // 直接追加日志文本（前端调用，已包含时间戳）
  appendToConnLog(content: string, connId: string): void {
    if (!this.enableLogStorage) return
    const fileName = this.connLogFiles.get(connId)
    if (!fileName) return

    const currentLogs = this.logCache.get(connId) || []
    // 直接追加，不添加额外时间戳
    const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '')
    for (const line of lines) {
      currentLogs.push(line)
    }
    this.logCache.set(connId, currentLogs)
  }

  // 连接关闭时刷入日志（保留记录以便后续打开日志）
  flushConnLog(connId: string): void {
    const remainingLogs = this.logCache.get(connId)
    if (remainingLogs && remainingLogs.length > 0) {
      const fileName = this.connLogFiles.get(connId)
      if (fileName) {
        const logFile = join(this.getConnLogDir(connId), fileName)
        const logData = remainingLogs.join('\n') + '\n'
        try {
          appendFileSync(logFile, logData, 'utf-8') // 同步写入
        } catch (err) {
          console.error(`Flush log on disconnect failed:`, err)
        }
      }
    }
    this.logCache.delete(connId)
  }

  // 真正清理日志记录（选项卡关闭时调用）
  clearConnLogFile(connId: string): void {
    this.flushConnLog(connId)
    this.connLogFiles.delete(connId)
    this.connLogDirs.delete(connId)
    this.connLogIndexes.delete(connId)
    this.connLogNames.delete(connId)
    this.connLogRemarks.delete(connId)
    this.currentFileSizes.delete(connId)
  }

  async openConnLog(connId: string, mode: 'folder' | 'file' = 'folder'): Promise<{ success: boolean; message: string } | null> {
    try {
      // 未启用日志存储时，直接提示
      if (!this.enableLogStorage) {
        return { success: false, message: 'Log storage is not enabled, please enable it in settings' }
      }

      this.flushAllLogs(false)

      const fileName = this.connLogFiles.get(connId)
      if (!fileName) {
        return { success: false, message: 'Connection log not found' }
      }

      const logFilePath = join(this.getConnLogDir(connId), fileName)
      if (!existsSync(logFilePath)) {
        return { success: false, message: 'Log file does not exist' }
      }

      if (shell && !(app as any).isQuitting) {
        if (mode === 'file') {
          await shell.openPath(logFilePath)
        } else {
          await shell.showItemInFolder(logFilePath)
        }
      }
      return { success: true, message: '' }
    } catch (error) {
      console.error('Failed to open log:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to open log file'
      }
    }
  }

  async openLogDir(): Promise<{ success: boolean; message: string } | null> {
    try {
      this.flushAllLogs(false)

      if (!existsSync(this.logDir)) {
        return { success: false, message: 'Log directory does not exist' }
      }

      if (shell && !(app as any).isQuitting) {
        await shell.openPath(this.logDir)
      }
      return { success: true, message: '' }
    } catch (error) {
      console.error('Failed to open log directory:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to open log directory'
      }
    }
  }

  async getLogFilePath(connId: string): Promise<{ success: boolean; filePath?: string; message?: string }> {
    try {
      this.flushAllLogs(false)

      const fileName = this.connLogFiles.get(connId)
      if (!fileName) {
        return { success: false, message: 'Log file not found' }
      }

      const logFilePath = join(this.getConnLogDir(connId), fileName)
      return { success: true, filePath: logFilePath }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '获取日志路径失败'
      }
    }
  }

  async copyLogFile(connId: string, destPath: string): Promise<{ success: boolean; message?: string }> {
    try {
      this.flushAllLogs(true) // 确保所有日志都已写入

      const fileName = this.connLogFiles.get(connId)
      if (!fileName) {
        return { success: false, message: 'Log file not found' }
      }

      const sourcePath = join(this.getConnLogDir(connId), fileName)
      if (!existsSync(sourcePath)) {
        return { success: false, message: 'Source log file does not exist' }
      }

      await fs.copyFile(sourcePath, destPath)
      return { success: true }
    } catch (error) {
      console.error('Failed to copy log file:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to copy log file'
      }
    }
  }

  // 日志归档：保留旧文件不动，创建新日志文件继续写入
  // 后续的日志写入、打开文件/文件夹操作都指向新文件
  async rotateLogFile(connId: string): Promise<{ success: boolean; message?: string; oldFileName?: string; newFileName?: string }> {
    try {
      this.flushAllLogs(true) // 确保所有日志都已写入

      const oldFileName = this.connLogFiles.get(connId)
      if (!oldFileName) {
        return { success: false, message: 'Log file not found' }
      }

      const connName = this.connLogNames.get(connId) || 'unknown'
      const remark = this.connLogRemarks.get(connId)
      const logDir = this.getConnLogDir(connId)

      // 用 resolveFileName 生成新文件名（与断开重连时的规则一致）
      let newLogFileName = `${this.resolveFileName(connName, remark)}.log`
      let newLogPath = join(logDir, newLogFileName)

      // 如果目标文件已存在，追加序号避免覆盖
      let counter = 1
      while (existsSync(newLogPath)) {
        newLogFileName = `${this.resolveFileName(connName, remark)}-${counter}.log`
        newLogPath = join(logDir, newLogFileName)
        counter++
      }

      // 创建新的空日志文件
      writeFileSync(newLogPath, '', 'utf-8')

      // 更新内部映射，后续写入和打开操作都指向新文件
      this.connLogFiles.set(connId, newLogFileName)
      this.connLogIndexes.set(connId, 0)
      this.currentFileSizes.set(connId, 0)

      return {
        success: true,
        oldFileName: oldFileName,
        newFileName: newLogFileName
      }
    } catch (error) {
      console.error('Failed to rotate log file:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to rotate log file'
      }
    }
  }
}
