import { shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { getAppDataDir } from '../../../utils/AppDir'
import { RuntimeEvent } from '../../../services/types/RuntimeTypes'
import { sanitizeKnownSecrets } from '../application/AuditSanitizer'

const AI_ACTIVITY_DIRECTORY_NAME = 'ai-activity'
const AI_ACTIVITY_CURRENT_FILE_NAME = 'ai-activity-current.log'
const AI_ACTIVITY_ARCHIVE_PATTERN = /^ai-activity-\d{8}-\d{9}(?:-\d{3})?\.log$/
const DEFAULT_HISTORY_LIMIT = 500
const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024
const DEFAULT_MAX_FILES = 5
const MAX_PENDING_BYTES = 1024 * 1024
const MAX_HISTORY_READ_BYTES = 1024 * 1024

export interface AiActivityLogInfo {
  filePath: string
  directory: string
}

export interface AiActivityLogger {
  error: (message: string, meta?: unknown) => void
  warn?: (message: string, meta?: unknown) => void
}

export interface AiActivityLogOptions {
  directory?: string
  maxFileBytes?: number
  maxFiles?: number
}

interface NormalizedLogOptions {
  directory: string
  maxFileBytes: number
  maxFiles: number
}

interface LogTarget extends NormalizedLogOptions {
  filePath: string
}

function isAiActivity(event: RuntimeEvent): boolean {
  return event.eventType === 'ai.activity' && event.source === 'ai'
}

function normalizeOptions(
  options: AiActivityLogOptions,
  fallbackDirectory?: string
): NormalizedLogOptions {
  const configuredDirectory = typeof options.directory === 'string' ? options.directory.trim() : ''
  const directory = configuredDirectory
    ? path.normalize(configuredDirectory)
    : fallbackDirectory || path.join(getAppDataDir(), 'app-logs', AI_ACTIVITY_DIRECTORY_NAME)
  const maxFileBytes = Number.isFinite(options.maxFileBytes)
    ? Math.max(1024, Math.trunc(options.maxFileBytes as number))
    : DEFAULT_MAX_FILE_BYTES
  const maxFiles = Number.isFinite(options.maxFiles)
    ? Math.max(1, Math.min(10, Math.trunc(options.maxFiles as number)))
    : DEFAULT_MAX_FILES
  return { directory, maxFileBytes, maxFiles }
}

function formatArchiveTimestamp(date = new Date()): string {
  return (
    `${date.getFullYear()}` +
    `${String(date.getMonth() + 1).padStart(2, '0')}` +
    `${String(date.getDate()).padStart(2, '0')}` +
    `-${String(date.getHours()).padStart(2, '0')}` +
    `${String(date.getMinutes()).padStart(2, '0')}` +
    `${String(date.getSeconds()).padStart(2, '0')}` +
    `${String(date.getMilliseconds()).padStart(3, '0')}`
  )
}

function sanitizeDetails(value: unknown): Record<string, string | number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const sanitized = sanitizeKnownSecrets(value as Record<string, unknown>)

  const allowedFields = [
    'command',
    'domain',
    'fields',
    'sessionId',
    'name',
    'connectionId',
    'groupId',
    'commandId',
    'mode'
  ]
  const result: Record<string, string | number> = {}
  for (const field of allowedFields) {
    const fieldValue = sanitized[field]
    if (
      typeof fieldValue === 'string' ||
      (typeof fieldValue === 'number' && Number.isFinite(fieldValue))
    ) {
      result[field] = fieldValue
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function toStoredEvent(event: RuntimeEvent): RuntimeEvent {
  const payload = event.payload || {}
  const details = sanitizeDetails(payload.details)
  return {
    eventId: event.eventId,
    sequence: event.sequence,
    timestamp: event.timestamp,
    eventType: 'ai.activity',
    source: 'ai',
    ...(event.sessionId ? { sessionId: event.sessionId } : {}),
    payload: {
      method: typeof payload.method === 'string' ? payload.method : 'unknown',
      action: payload.action === 'read' ? 'read' : 'control',
      status: payload.status === 'failed' ? 'failed' : 'success',
      ...(typeof payload.principalId === 'string' ? { principalId: payload.principalId } : {}),
      ...(typeof payload.clientName === 'string' ? { clientName: payload.clientName } : {}),
      ...(details ? { details } : {}),
      ...(typeof payload.errorCode === 'string' ? { errorCode: payload.errorCode } : {})
    }
  }
}

/**
 * 将脱敏后的 `ai.activity` 事件异步写入有界 JSON Lines 日志。
 * 单文件达到上限后按编号轮转；历史读取只扫描各文件尾部的有限字节。
 */
export default class AiActivityLog {
  private directory: string
  private filePath: string
  private options: NormalizedLogOptions
  private readonly pendingLines: string[] = []
  private pendingBytes = 0
  private flushScheduled = false
  private writeChain: Promise<void> = Promise.resolve()
  private queueOverflowWarned = false

  constructor(
    private readonly logger: AiActivityLogger,
    options: AiActivityLogOptions = {}
  ) {
    this.options = normalizeOptions(options)
    this.directory = this.options.directory
    this.filePath = path.join(this.directory, AI_ACTIVITY_CURRENT_FILE_NAME)
  }

  configure(options: AiActivityLogOptions): void {
    const next = normalizeOptions(options, this.directory)
    if (
      next.directory === this.options.directory &&
      next.maxFileBytes === this.options.maxFileBytes &&
      next.maxFiles === this.options.maxFiles
    ) {
      return
    }
    this.drainPending()
    const directoryChanged = next.directory !== this.options.directory
    const maxFilesChanged = next.maxFiles !== this.options.maxFiles
    this.options = next
    this.directory = next.directory
    this.filePath = path.join(this.directory, AI_ACTIVITY_CURRENT_FILE_NAME)
    if (!directoryChanged && !maxFilesChanged) return
    const target = this.snapshotTarget()
    this.writeChain = this.writeChain
      .then(() => this.removeExcessBackups(target))
      .catch((error) => this.logger.error('[AiActivityLog] failed to apply limits', error))
  }

  record(event: RuntimeEvent): void {
    if (!isAiActivity(event)) return

    const line = `${JSON.stringify(toStoredEvent(event))}\n`
    const bytes = Buffer.byteLength(line, 'utf8')
    if (bytes > this.options.maxFileBytes || this.pendingBytes + bytes > MAX_PENDING_BYTES) {
      if (!this.queueOverflowWarned) {
        this.queueOverflowWarned = true
        this.logger.warn?.('[AiActivityLog] activity queue limit reached; entries dropped')
      }
      return
    }

    this.pendingLines.push(line)
    this.pendingBytes += bytes
    if (this.flushScheduled) return
    this.flushScheduled = true
    setImmediate(() => {
      this.flushScheduled = false
      this.drainPending()
    })
  }

  async flush(): Promise<void> {
    this.flushScheduled = false
    this.drainPending()
    await this.writeChain
  }

  async readHistory(limit: number = DEFAULT_HISTORY_LIMIT): Promise<RuntimeEvent[]> {
    await this.flush()
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(2000, Math.trunc(limit)))
      : DEFAULT_HISTORY_LIMIT
    const segments: RuntimeEvent[][] = []
    let remainingBytes = MAX_HISTORY_READ_BYTES
    const target = this.snapshotTarget()

    try {
      const archiveLimit = Math.max(0, target.maxFiles - 1)
      const allArchives = await this.listArchivePaths(target.directory)
      const archives = (archiveLimit > 0 ? allArchives.slice(-archiveLimit) : []).reverse()
      const paths = [target.filePath, ...archives]
      for (const filePath of paths) {
        if (remainingBytes <= 0) break
        const lines = await this.readTailLines(filePath, remainingBytes)
        remainingBytes -= lines.bytesRead
        const events: RuntimeEvent[] = []
        for (const line of lines.lines) {
          try {
            const event = JSON.parse(line) as RuntimeEvent
            if (isAiActivity(event)) events.push(event)
          } catch {
            // 进程中断可能留下不完整尾行，忽略后继续读取其他记录。
          }
        }
        if (events.length > 0) segments.unshift(events)
      }
      return segments.flat().slice(-safeLimit)
    } catch (error) {
      this.logger.error('[AiActivityLog] failed to read activity', error)
      return []
    }
  }

  getInfo(): AiActivityLogInfo {
    return { filePath: this.filePath, directory: this.directory }
  }

  async openDirectory(): Promise<{ success: boolean; message?: string }> {
    try {
      await fs.promises.mkdir(this.directory, { recursive: true })
      const error = await shell.openPath(this.directory)
      return error ? { success: false, message: error } : { success: true }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async clearHistory(): Promise<void> {
    await this.flush()
    await fs.promises.rm(this.filePath, { force: true })
    for (const filePath of await this.listArchivePaths(this.directory)) {
      await fs.promises.rm(filePath, { force: true })
    }
  }

  private drainPending(): void {
    if (this.pendingLines.length === 0) return
    const lines = this.pendingLines.splice(0)
    this.pendingBytes = 0
    this.queueOverflowWarned = false
    const target = this.snapshotTarget()
    this.writeChain = this.writeChain
      .then(() => this.writeLines(lines, target))
      .catch((error) => this.logger.error('[AiActivityLog] failed to append activity', error))
  }

  private async writeLines(lines: string[], target: LogTarget): Promise<void> {
    await fs.promises.mkdir(target.directory, { recursive: true })
    let activeSize = await this.getFileSize(target.filePath)
    let chunk = ''

    const appendChunk = async (): Promise<void> => {
      if (!chunk) return
      await fs.promises.appendFile(target.filePath, chunk, 'utf8')
      chunk = ''
    }

    for (const line of lines) {
      const bytes = Buffer.byteLength(line, 'utf8')
      if (activeSize > 0 && activeSize + bytes > target.maxFileBytes) {
        await appendChunk()
        await this.rotate(target)
        activeSize = 0
      }
      chunk += line
      activeSize += bytes
    }
    await appendChunk()
  }

  private async rotate(target: LogTarget): Promise<void> {
    if (target.maxFiles <= 1) {
      await fs.promises.rm(target.filePath, { force: true })
      return
    }

    const archivePath = await this.createArchivePath(target.directory)
    await this.renameIfExists(target.filePath, archivePath)
    await this.removeExcessBackups(target)
  }

  private async removeExcessBackups(target: LogTarget): Promise<void> {
    const archives = await this.listArchivePaths(target.directory)
    const retainedArchives = Math.max(0, target.maxFiles - 1)
    const excess = archives.slice(0, Math.max(0, archives.length - retainedArchives))
    for (const filePath of excess) {
      await fs.promises.rm(filePath, { force: true })
    }
  }

  private async renameIfExists(source: string, destination: string): Promise<void> {
    try {
      await fs.promises.rename(source, destination)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  private async getFileSize(filePath: string): Promise<number> {
    try {
      return (await fs.promises.stat(filePath)).size
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
      throw error
    }
  }

  private snapshotTarget(): LogTarget {
    return {
      directory: this.directory,
      filePath: this.filePath,
      maxFileBytes: this.options.maxFileBytes,
      maxFiles: this.options.maxFiles
    }
  }

  private async listArchivePaths(directory: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(directory, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isFile() && AI_ACTIVITY_ARCHIVE_PATTERN.test(entry.name))
        .map((entry) => path.join(directory, entry.name))
        .sort((left, right) => path.basename(left).localeCompare(path.basename(right)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  private async createArchivePath(directory: string): Promise<string> {
    const timestamp = formatArchiveTimestamp()
    let suffix = 0
    while (true) {
      const fileName =
        `ai-activity-${timestamp}` +
        `${suffix > 0 ? `-${String(suffix).padStart(3, '0')}` : ''}.log`
      const candidate = path.join(directory, fileName)
      try {
        await fs.promises.access(candidate)
        suffix += 1
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return candidate
        throw error
      }
    }
  }

  private async readTailLines(
    filePath: string,
    maxBytes: number
  ): Promise<{ lines: string[]; bytesRead: number }> {
    let handle: fs.promises.FileHandle | undefined
    try {
      handle = await fs.promises.open(filePath, 'r')
      const size = (await handle.stat()).size
      const bytesToRead = Math.min(size, maxBytes)
      const offset = Math.max(0, size - bytesToRead)
      const buffer = Buffer.alloc(bytesToRead)
      const result = await handle.read(buffer, 0, bytesToRead, offset)
      let text = buffer.subarray(0, result.bytesRead).toString('utf8')
      if (offset > 0) {
        const firstBreak = text.indexOf('\n')
        text = firstBreak >= 0 ? text.slice(firstBreak + 1) : ''
      }
      return {
        lines: text.split(/\r?\n/).filter(Boolean),
        bytesRead: result.bytesRead
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { lines: [], bytesRead: 0 }
      throw error
    } finally {
      await handle?.close()
    }
  }
}
