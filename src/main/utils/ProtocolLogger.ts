import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync, readdirSync, unlinkSync, lstatSync } from 'fs'
import { shell, app } from 'electron'
import fs from 'fs/promises'
import { dirname, join, parse, resolve, isAbsolute } from 'path'
import { getAppDataDir } from './AppDir'

// 磁盘空间相关
const diskSpace = (() => {
  try {
    return require('disk-size') // 可选依赖
  } catch {
    return null
  }
})()

export interface LogSplitCallback {
  (connId: string, oldFileName: string, newFileName: string): void
}

export default class ProtocolLogger {
  private logDir: string
  private logDirPattern: string = '' // 目录模板（用户设置的原始模板）
  private defaultLogDir: string // 默认目录（程序目录/logs）
  private connLogFiles = new Map<string, string>()
  private connLogFileHistory = new Map<string, string[]>()
  private connLogBaseNames = new Map<string, string>()
  private connLogDirs = new Map<string, string>() // 每个连接解析后的日志目录
  private connLogIndexes = new Map<string, number>()
  private connLogNames = new Map<string, string>() // 保存原始连接名
  private connLogRemarks = new Map<string, string>() // 保存备注名
  private logCache = new Map<string, string[]>()
  private failedCache = new Map<string, string[]>() // 写入失败的缓存
  private failedCacheEntries = 0
  private readonly MAX_FAILED_CACHE_ENTRIES = 10000
  private currentFileSizes = new Map<string, number>()
  // 标记该连接下次连接时需创建新的日志文件（手动断开后保留旧日志可打开，但重连时另起新文件）
  private connLogNeedsNew = new Map<string, boolean>()
  private logSplitCallback: LogSplitCallback | null = null
  private writeTimer: NodeJS.Timeout | null = null
  private cleanupTimer: NodeJS.Timeout | null = null
  private retryTimer: NodeJS.Timeout | null = null // 失败重试定时器
  private readonly BATCH_WRITE_INTERVAL_MS = 10 * 1000
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // 每小时检查一次
  private readonly RETRY_INTERVAL_MS = 60 * 1000 // 1分钟重试一次
  private logSplitSizeMB: number = 20 // 默认 20MB
  private enableLogStorage: boolean = true // 是否启用日志存储
  private logFileNamePattern: string = '%C-%Y-%M-%D-%hh-%mm-%ss' // 文件名模板
  private maxLogAgeDays: number = 30 // 日志最大保留天数
  private maxLogCount: number = 100 // 所有扫描根合计保留的最新日志文件数
  private diskSpaceWarningMB: number = 100 // 磁盘空间预警阈值（MB）
  private isDiskSpaceLow: boolean = false // 磁盘空间是否不足

  constructor() {
    // 智能路径：exe 同目录（非系统盘有权限）或 userData（回退）
    this.defaultLogDir = join(getAppDataDir(), 'logs')
    this.logDir = this.defaultLogDir

    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true })
    }

    this.startWriteTimer()
    this.startCleanupTimer()
    this.startRetryTimer()
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
      this.logDir = this.getLogScanRoot(dirPath)
    } else {
      this.logDirPattern = ''
      this.logDir = this.defaultLogDir
      this.ensureDir(this.logDir)
    }
  }

  // 模板目录只能从第一个占位符之前的静态路径推导扫描根。
  private getLogScanRoot(pattern: string): string {
    const placeholder = /%(?:fff|MM|DD|hh|mm|ss|C|R|Y|M|D|h|m|s|f)/
    const match = placeholder.exec(pattern)
    if (!match) return resolve(pattern)
    const staticPart = match ? pattern.slice(0, match.index) : pattern
    const rootPart = match && !/[\\/]$/.test(staticPart) ? dirname(staticPart) : staticPart
    const scanRoot = isAbsolute(rootPart) ? resolve(rootPart) : resolve(this.defaultLogDir, rootPart || '.')
    // Never recursively scan a filesystem root. Templates such as /%Y or
    // /logs-%Y do not provide a safe static directory boundary.
    if (scanRoot === parse(scanRoot).root) return this.defaultLogDir
    return scanRoot
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
      // 不补零版本，必须先替换双字母占位符，避免被单字母匹配截断。
      .replace(/%fff/g, String(date.getMilliseconds()))
      .replace(/%MM/g, String(date.getMonth() + 1))
      .replace(/%DD/g, String(date.getDate()))
      .replace(/%hh/g, String(date.getHours()))
      .replace(/%mm/g, String(date.getMinutes()))
      .replace(/%ss/g, String(date.getSeconds()))
      .replace(/%C/g, connName)
      .replace(/%R/g, remark || '')
      .replace(/%Y/g, Y)
      .replace(/%M/g, M)
      .replace(/%D/g, D)
      .replace(/%h/g, h)
      .replace(/%m/g, m)
      .replace(/%s/g, s)
      .replace(/%f/g, f)

    // 相对模板统一放在默认日志目录下，避免 Linux 从不同启动目录运行时
    // 出现“写入目录”和“清理扫描目录”不一致。
    const safeResult = result.replace(/[*?"<>|]/g, '-')
    return isAbsolute(safeResult) ? safeResult : resolve(this.defaultLogDir, safeResult)
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

  // 启动定时清理旧日志
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldLogs()
    }, this.CLEANUP_INTERVAL_MS)
    if (this.cleanupTimer.unref) this.cleanupTimer.unref()
  }

  // 启动失败重试定时器
  private startRetryTimer(): void {
    this.retryTimer = setInterval(() => {
      this.retryFailedLogs()
    }, this.RETRY_INTERVAL_MS)
    if (this.retryTimer.unref) this.retryTimer.unref()
  }

  // 重试失败的日志写入
  private retryFailedLogs(): void {
    if (this.failedCache.size === 0) return

    // 将失败缓存移回正常缓存
    this.failedCache.forEach((entries, connId) => {
      const currentCache = this.logCache.get(connId) || []
      this.logCache.set(connId, [...entries, ...currentCache])
    })
    this.failedCache.clear()
    this.failedCacheEntries = 0

    // 尝试重新写入
    this.flushAllLogs(false)
  }

  // 设置日志最大保留天数
  setMaxLogAgeDays(days: number): void {
    this.maxLogAgeDays = days
  }

  // 设置日志最大文件数
  setMaxLogCount(count: number): void {
    this.maxLogCount = count
  }

  manualCleanup(): { success: boolean; deletedCount: number; deletedSize: number; failedCount: number; failedFiles: string[] } {
    return this.cleanupLogs(true)
  }

  private cleanupLogs(force = false): { success: boolean; deletedCount: number; deletedSize: number; failedCount: number; failedFiles: string[] } {
    const result = { success: true, deletedCount: 0, deletedSize: 0, failedCount: 0, failedFiles: [] as string[] }
    if (!force && this.maxLogAgeDays <= 0 && this.maxLogCount <= 0) return result
    const active = new Set<string>()
    this.connLogFiles.forEach((fileName, connId) => active.add(resolve(this.getConnLogDir(connId), fileName)))
    const files: { path: string; mtime: number; size: number; active: boolean }[] = []
    const scannedPaths = new Set<string>()
    const roots = [...new Set([
      this.logDirPattern ? this.getLogScanRoot(this.logDirPattern) : this.logDir,
      this.defaultLogDir,
      ...this.connLogDirs.values()
    ].map(dir => resolve(dir)))]

    const scan = (dir: string): void => {
      let entries: string[]
      try {
        entries = readdirSync(dir)
      } catch {
        result.success = false
        result.failedCount++
        result.failedFiles.push(dir)
        return
      }
      for (const name of entries) {
        const filePath = resolve(dir, name)
        let stats
        try {
          stats = lstatSync(filePath)
        } catch {
          result.success = false
          result.failedCount++
          result.failedFiles.push(filePath)
          continue
        }
        if (stats.isSymbolicLink()) continue
        if (stats.isDirectory()) {
          scan(filePath)
        } else if (stats.isFile() && name.endsWith('.log') && !scannedPaths.has(filePath)) {
          scannedPaths.add(filePath)
          files.push({ path: filePath, mtime: stats.mtimeMs, size: stats.size, active: active.has(filePath) })
        }
      }
    }

    for (const root of roots) {
      let rootStats
      try {
        rootStats = lstatSync(root)
      } catch {
        result.success = false
        result.failedCount++
        result.failedFiles.push(root)
        continue
      }
      if (!rootStats.isSymbolicLink() && rootStats.isDirectory()) scan(root)
    }

    files.sort((a, b) => b.mtime - a.mtime)
    const deletePaths = new Set<string>()
    if (force && this.maxLogAgeDays <= 0 && this.maxLogCount <= 0) {
      files.forEach(file => { if (!file.active) deletePaths.add(file.path) })
    } else if (this.maxLogAgeDays > 0) {
      const age = this.maxLogAgeDays * 24 * 60 * 60 * 1000
      files.forEach(file => { if (!file.active && Date.now() - file.mtime > age) deletePaths.add(file.path) })
    }
    if (this.maxLogCount > 0) files.slice(this.maxLogCount).forEach(file => { if (!file.active) deletePaths.add(file.path) })
    for (const file of files) {
      if (!deletePaths.has(file.path)) continue
      try {
        unlinkSync(file.path)
        result.deletedCount++
        result.deletedSize += file.size
      } catch {
        result.success = false
        result.failedCount++
        result.failedFiles.push(file.path)
      }
    }
    return result
  }

  // 清理旧日志文件
  private cleanupOldLogs(): void {
    this.cleanupLogs()
  }

  // 检查磁盘空间
  private checkDiskSpace(connId?: string): boolean {
    const logDir = connId ? this.getConnLogDir(connId) : this.logDir
    try {
      // 尝试使用 disk-size 库
      if (diskSpace && diskSpace.getDiskSpace) {
        const result = diskSpace.getDiskSpace(logDir)
        if (result && result.free) {
          const freeMB = result.free / (1024 * 1024)
          if (freeMB < this.diskSpaceWarningMB) {
            if (!this.isDiskSpaceLow) {
              console.warn(`[ProtocolLogger] Low disk space: ${freeMB.toFixed(1)}MB remaining, logging paused`)
              this.isDiskSpaceLow = true
            }
            return false
          }
          this.isDiskSpaceLow = false
          return true
        }
      }

      // 回退：使用 statfs（Node.js 18+）
      const { statfsSync } = require('fs') as any
      if (statfsSync) {
        const stats = statfsSync(logDir)
        const freeMB = (stats.bavail * stats.bsize) / (1024 * 1024)
        if (freeMB < this.diskSpaceWarningMB) {
          if (!this.isDiskSpaceLow) {
            console.warn(`[ProtocolLogger] Low disk space: ${freeMB.toFixed(1)}MB remaining, logging paused`)
            this.isDiskSpaceLow = true
          }
          return false
        }
        this.isDiskSpaceLow = false
        return true
      }
    } catch {
      // 无法检测时假设正常
    }
    return true
  }

  // 获取磁盘空间状态
  getDiskSpaceStatus(): { isLow: boolean; warningMB: number } {
    return { isLow: this.isDiskSpaceLow, warningMB: this.diskSpaceWarningMB }
  }

  // 设置磁盘空间预警阈值
  setDiskSpaceWarningMB(mb: number): void {
    this.diskSpaceWarningMB = mb
  }

  // 检查并处理日志分片
  private checkAndSplitLog(connId: string, incomingBytes = 0): string {
    const fileName = this.connLogFiles.get(connId)
    if (!fileName) return fileName || ''

    // 0 = 不分片
    if (this.logSplitSizeMB <= 0) return fileName

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
    // A single record larger than the limit is written to an empty file as-is.
    if (currentSize > 0 && currentSize + incomingBytes > maxSizeBytes) {
      const oldFileName = fileName
      const index = (this.connLogIndexes.get(connId) || 0) + 1
      this.connLogIndexes.set(connId, index)

      const baseName = this.connLogBaseNames.get(connId) || oldFileName.replace(/\.log$/, '')
      const newFileName = `${baseName}-${index}.log`
      this.connLogFiles.set(connId, newFileName)
      this.connLogFileHistory.set(connId, [...(this.connLogFileHistory.get(connId) || []), newFileName])
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
  private flushAllLogs(_isSync: boolean = false): void {
    this.logCache.forEach((logEntries, connId) => {
      if (logEntries.length <= 0) {
        return
      }

      const logData = logEntries.join('\n') + '\n'
      // Include the pending batch in the split decision, not only the old file size.
      const fileName = this.checkAndSplitLog(connId, Buffer.byteLength(logData, 'utf8'))
      if (!fileName) return
      const logFile = join(this.getConnLogDir(connId), fileName)

      try {
        this.ensureDir(dirname(logFile))
        if (!this.checkDiskSpace(connId)) throw new Error('Insufficient disk space for log write')
        // Synchronous, ordered writes avoid concurrent append callbacks racing on split files.
        appendFileSync(logFile, logData, 'utf-8')
        this.currentFileSizes.set(connId, statSync(logFile).size)
        this.logCache.set(connId, [])
      } catch (err) {
        console.error(`Write log failed [connId:${connId}]:`, err)
        const failed = this.failedCache.get(connId) || []
        const available = Math.max(0, this.MAX_FAILED_CACHE_ENTRIES - this.failedCacheEntries)
        const retained = logEntries.slice(0, available)
        this.failedCache.set(connId, [...failed, ...retained])
        this.failedCacheEntries += retained.length
        if (retained.length < logEntries.length) {
          console.error(`[ProtocolLogger] Failed log cache full; dropped ${logEntries.length - retained.length} entries`)
        }
        this.logCache.delete(connId)
      }
    })
  }

  flush(): void {
    if (this.writeTimer) {
      clearInterval(this.writeTimer)
      this.writeTimer = null
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    if (this.retryTimer) {
      clearInterval(this.retryTimer)
      this.retryTimer = null
    }
    // 退出前重试失败的日志
    this.retryFailedLogs()
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
      // 不补零版本，必须先替换双字母占位符，避免被单字母匹配截断。
      .replace(/%fff/g, String(date.getMilliseconds()))
      .replace(/%MM/g, String(date.getMonth() + 1))
      .replace(/%DD/g, String(date.getDate()))
      .replace(/%hh/g, String(date.getHours()))
      .replace(/%mm/g, String(date.getMinutes()))
      .replace(/%ss/g, String(date.getSeconds()))
      .replace(/%C/g, connName)
      .replace(/%R/g, remark || '')
      .replace(/%Y/g, Y)
      .replace(/%M/g, M)
      .replace(/%D/g, D)
      .replace(/%h/g, h)
      .replace(/%m/g, m)
      .replace(/%s/g, s)
      .replace(/%f/g, f)

    // 日志文件名不能保留路径分隔符，Linux 串口名如 /dev/ttyUSB0 会被当成子目录。
    return result.replace(/[\\/\\*?:"<>|]/g, '-')
  }

  createConnLogFile(connId: string, connName: string, remark?: string): string {
    if (!this.enableLogStorage) {
      return ''
    }
    // 手动断开后再次连接时，需要另起新的日志文件（旧日志保留可打开）
    // 自动重连/自动重试（未经过 stop-connect）时复用已创建的日志文件，避免生成 0KB 空文件堆积
    const existingFileName = this.connLogFiles.get(connId)
    const needsNew = this.connLogNeedsNew.get(connId) === true
    if (existingFileName && !needsNew) {
      // 仍解析并同步日志目录，保证日志设置变更后打开/写入仍指向正确位置
      const resolvedDir = this.resolveDirName(connName, remark)
      this.ensureDir(resolvedDir)
      this.connLogDirs.set(connId, resolvedDir)
      this.logDir = resolvedDir
      return existingFileName
    }
    // 需要新文件时，清理旧映射并清除标记（后续自动重连则复用新文件）
    this.connLogNeedsNew.delete(connId)
    // 解析目录模板，创建对应的目录
    const resolvedDir = this.resolveDirName(connName, remark)
    this.ensureDir(resolvedDir)
    this.connLogDirs.set(connId, resolvedDir)
    // 同时更新全局 logDir（用于 openLogDir 等无连接上下文的操作）
    this.logDir = resolvedDir

    const baseFileName = `${this.resolveFileName(connName, remark)}.log`
    let fileName = baseFileName
    let suffix = 1
    while (existsSync(join(resolvedDir, fileName))) {
      fileName = `${baseFileName.replace(/\.log$/, '')}-${suffix++}.log`
    }
    this.connLogFiles.set(connId, fileName)
    this.connLogFileHistory.set(connId, [fileName])
    this.connLogBaseNames.set(connId, fileName.replace(/\.log$/, ''))
    this.connLogIndexes.set(connId, 0)
    this.connLogNames.set(connId, connName) // 保存原始连接名
    if (remark) {
      this.connLogRemarks.set(connId, remark)
    }
    this.logCache.set(connId, [])
    this.currentFileSizes.set(connId, 0)

    // 连接时立即创建空日志文件，避免刚连接时点击打开日志提示文件不存在
    const logFilePath = join(resolvedDir, fileName)
    this.ensureDir(dirname(logFilePath))
    writeFileSync(logFilePath, '', 'utf-8')

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

  // 直接追加日志文本。若传入内容只在整段开头带时间戳，拆行后为每一行补同一个时间戳。
  appendToConnLog(content: string, connId: string): void {
    if (!this.enableLogStorage) return
    const fileName = this.connLogFiles.get(connId)
    if (!fileName) return

    const currentLogs = this.logCache.get(connId) || []
    const timestampMatch = content.match(/^(\[\d{4}-\d{2}-\d{2}\s[^\]]+\]\s*)/)
    const timestampPrefix = timestampMatch ? timestampMatch[1] : `[${this.getTimeStamp()}] `
    const logContent = timestampMatch ? content.slice(timestampPrefix.length) : content
    const lines = logContent.split(/\r?\n/).filter((line) => line.trim() !== '')
    for (const line of lines) {
      currentLogs.push(/^\[\d{4}-\d{2}-\d{2}\s/.test(line) ? line : `${timestampPrefix}${line}`)
    }
    this.logCache.set(connId, currentLogs)
  }

  // 连接关闭时刷入日志（保留记录以便后续打开日志）
  flushConnLog(connId: string): boolean {
    const remainingLogs = [
      ...(this.failedCache.get(connId) || []),
      ...(this.logCache.get(connId) || [])
    ]
    if (remainingLogs && remainingLogs.length > 0) {
      const fileName = this.connLogFiles.get(connId)
      if (fileName) {
        const logFile = join(this.getConnLogDir(connId), fileName)
        const logData = remainingLogs.join('\n') + '\n'
        try {
          this.ensureDir(dirname(logFile))
          if (!this.checkDiskSpace(connId)) throw new Error('Insufficient disk space for log write')
          appendFileSync(logFile, logData, 'utf-8') // 同步写入
          this.failedCacheEntries -= (this.failedCache.get(connId) || []).length
          this.failedCache.delete(connId)
          this.logCache.delete(connId)
          this.currentFileSizes.set(connId, statSync(logFile).size)
          return true
        } catch (err) {
          console.error(`Flush log on disconnect failed:`, err)
          // Move the new batch to the retry queue; existing failed entries are
          // already included in it and must not be duplicated.
          const pendingBatch = this.logCache.get(connId) || []
          if (pendingBatch.length > 0) {
            const failed = this.failedCache.get(connId) || []
            const available = Math.max(0, this.MAX_FAILED_CACHE_ENTRIES - this.failedCacheEntries)
            const retained = pendingBatch.slice(0, available)
            this.failedCache.set(connId, [...failed, ...retained])
            this.failedCacheEntries += retained.length
            if (retained.length < pendingBatch.length) {
              console.error(`[ProtocolLogger] Failed log cache full; dropped ${pendingBatch.length - retained.length} entries`)
            }
            this.logCache.delete(connId)
          }
          return false
        }
      }
    }
    if (!this.connLogFiles.has(connId)) return false
    this.logCache.delete(connId)
    return true
  }

  // 真正清理日志记录（选项卡关闭时调用）
  clearConnLogFile(connId: string): void {
    this.flushConnLog(connId)
    if (this.failedCache.has(connId) || (this.logCache.get(connId)?.length || 0) > 0) return
    this.connLogFiles.delete(connId)
    this.connLogFileHistory.delete(connId)
    this.connLogBaseNames.delete(connId)
    this.connLogDirs.delete(connId)
    this.connLogIndexes.delete(connId)
    this.connLogNames.delete(connId)
    this.connLogRemarks.delete(connId)
    this.currentFileSizes.delete(connId)
    if (!this.failedCache.has(connId)) this.failedCacheEntries = Math.max(0, this.failedCacheEntries)
    this.connLogNeedsNew.delete(connId)
  }

  /**
   * 手动断开时标记该连接下次连接需新建日志文件。
   * 与 clearConnLogFile 的区别：此方法保留日志文件映射，
   * 使得断开后仍可通过"打开日志所在文件夹/打开日志文件"访问旧日志；
   * 但下次手动重连时（createConnLogFile）会创建新的日志文件。
   */
  markConnLogRotate(connId: string): void {
    if (!this.flushConnLog(connId)) return
    // 仅当该连接确实存在日志文件时才标记轮换，否则下次连接走正常新建逻辑
    if (this.connLogFiles.has(connId)) {
      this.connLogNeedsNew.set(connId, true)
    }
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
        message: error instanceof Error ? error.message : 'Failed to get log file path'
      }
    }
  }

  async copyLogFile(
    connId: string,
    destPath: string,
    onProgress?: (percent: number) => void,
    options?: { hours?: number }
  ): Promise<{ success: boolean; message?: string }> {
    try {
      if (!this.enableLogStorage) {
        return { success: false, message: 'Log storage is not enabled, please enable it in settings' }
      }

      const fileNames = this.connLogFileHistory.get(connId) || []
      if (!this.connLogFiles.has(connId) || fileNames.length === 0) {
        return { success: false, message: 'Log file not found' }
      }

      const hasPendingLogs = (this.logCache.get(connId)?.length || 0) > 0
        || (this.failedCache.get(connId)?.length || 0) > 0
      // Only a session with unwritten data needs to be flushed before export.
      if (hasPendingLogs && !this.flushConnLog(connId)) {
        return { success: false, message: 'Failed to flush pending log data before export' }
      }

      const logDir = this.getConnLogDir(connId)
      await fs.mkdir(dirname(destPath), { recursive: true })

      // 如果指定了时间范围，按时间筛选
      if (options?.hours !== undefined && (!Number.isFinite(options.hours) || options.hours <= 0)) {
        return { success: false, message: 'Invalid time range' }
      }
      if (options?.hours !== undefined) {
        return await this.copyLogFileWithTimeRange(connId, destPath, options.hours, onProgress)
      }

      // 收集有效文件并计算总大小
      const validFiles: { path: string; size: number }[] = []
      let totalSize = 0
      for (const fileName of fileNames) {
        const sourcePath = join(logDir, fileName)
        if (existsSync(sourcePath)) {
          const stats = statSync(sourcePath)
          validFiles.push({ path: sourcePath, size: stats.size })
          totalSize += stats.size
        }
      }

      if (validFiles.length === 0) {
        return { success: false, message: 'Source log file does not exist' }
      }

      const normalizedDest = resolve(destPath)
      if (validFiles.some(file => this.samePath(file.path, normalizedDest))) {
        return { success: false, message: 'Export destination cannot overwrite a source log file' }
      }

      // 单文件直接复制，多文件流式追加
      if (validFiles.length === 1) {
        // 单文件：直接复制，最快
        await fs.copyFile(validFiles[0].path, destPath)
        if (onProgress) onProgress(100)
      } else {
        // Sequential synchronous appends make destination errors observable and avoid stream races.
        writeFileSync(destPath, '', 'utf-8')
        let copiedSize = 0
        for (const file of validFiles) {
          const content = await fs.readFile(file.path)
          appendFileSync(destPath, content)
          copiedSize += content.length
          // 报告进度
          if (onProgress && totalSize > 0) {
            onProgress(Math.min(100, Math.round((copiedSize / totalSize) * 100)))
          }
        }
      }

      return { success: true }
    } catch (error) {
      console.error('Failed to copy log file:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to copy log file'
      }
    }
  }

  // 按时间范围导出日志
  private async copyLogFileWithTimeRange(
    connId: string,
    destPath: string,
    hours: number,
    onProgress?: (percent: number) => void
  ): Promise<{ success: boolean; message?: string }> {
    const fileNames = this.connLogFileHistory.get(connId) || []
    const logDir = this.getConnLogDir(connId)
    const cutoff = Date.now() - hours * 60 * 60 * 1000
    const timestampRegex = /^\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/

    // 收集有效文件
    const validFiles: string[] = []
    for (const fileName of fileNames) {
      const sourcePath = join(logDir, fileName)
      if (existsSync(sourcePath)) {
        validFiles.push(sourcePath)
      }
    }

    if (validFiles.length === 0) {
      return { success: false, message: 'Source log file does not exist' }
    }

    const normalizedDest = resolve(destPath)
    if (validFiles.some(filePath => this.samePath(filePath, normalizedDest))) {
      return { success: false, message: 'Export destination cannot overwrite a source log file' }
    }

    // Read and write one file at a time so a long export does not build one large string.
    writeFileSync(destPath, '', 'utf-8')
    let processedFiles = 0

    for (const filePath of validFiles) {
      const content = await fs.readFile(filePath, 'utf-8')
      const lines = content.split('\n')

      // 按行匹配时间戳进行筛选
      const filtered = lines.filter(line => {
        const match = line.match(timestampRegex)
        if (!match) return true // 保留无时间戳的行（如连接信息）
        try {
          const lineTime = new Date(match[1]).getTime()
          return Number.isNaN(lineTime) || lineTime >= cutoff
        } catch {
          return true // 解析失败时保留
        }
      })

      if (filtered.length > 0) appendFileSync(destPath, filtered.join('\n') + '\n', 'utf-8')

      processedFiles++
      if (onProgress) {
        onProgress(Math.min(99, Math.round((processedFiles / validFiles.length) * 100)))
      }
    }

    if (onProgress) onProgress(100)

    return { success: true }
  }

  private samePath(left: string, right: string): boolean {
    const normalizedLeft = resolve(left)
    const normalizedRight = resolve(right)
    return process.platform === 'win32'
      ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
      : normalizedLeft === normalizedRight
  }

  // 日志归档：保留旧文件不动，创建新日志文件继续写入
  // 后续的日志写入、打开文件/文件夹操作都指向新文件
  async rotateLogFile(connId: string): Promise<{ success: boolean; message?: string; oldFileName?: string; newFileName?: string }> {
    try {
      const oldFileName = this.connLogFiles.get(connId)
      if (!oldFileName) {
        return { success: false, message: 'Log file not found' }
      }

      // Rotation must not detach the active file while this connection still has
      // unwritten data. Other connections may continue flushing independently.
      if (!this.flushConnLog(connId)) {
        return { success: false, message: 'Failed to flush pending log data before rotation' }
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
      this.connLogFileHistory.set(connId, [...(this.connLogFileHistory.get(connId) || []), newLogFileName])
      this.connLogBaseNames.set(connId, newLogFileName.replace(/\.log$/, ''))
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
