import fs from 'fs'

const DEFAULT_TAIL_BYTES = 32 * 1024
const MAX_TAIL_BYTES = 64 * 1024
const DEFAULT_TAIL_LINES = 200
const MAX_TAIL_LINES = 1000
const DEFAULT_SEARCH_BYTES = 512 * 1024
const MAX_SEARCH_BYTES = 2 * 1024 * 1024
const MAX_SEARCH_RESULTS_BYTES = 64 * 1024

export interface AiLogPathResult {
  success: boolean
  filePath?: string
  message?: string
}

export interface AiLogResolver {
  getLogFilePath: (sessionId: string) => Promise<AiLogPathResult>
}

interface SearchMatch {
  line: string
  before: string[]
  after: string[]
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function takeLastLinesWithinBytes(lines: string[], maxBytes: number): string[] {
  const result: string[] = []
  let bytes = 0
  for (let index = lines.length - 1; index >= 0; index--) {
    const lineBytes = Buffer.byteLength(lines[index], 'utf8') + (result.length > 0 ? 1 : 0)
    if (bytes + lineBytes > maxBytes) break
    result.unshift(lines[index])
    bytes += lineBytes
  }
  return result
}

/** 从软件自己的连接日志中执行有界尾读和搜索，避免把整份日志载入主进程或 AI 上下文。 */
export default class AiLogReader {
  constructor(private readonly resolver: AiLogResolver) {}

  async readTail(
    sessionId: string,
    options: { maxBytes?: number; maxLines?: number } = {}
  ): Promise<Record<string, unknown>> {
    const filePath = await this.requireLogPath(sessionId)
    const maxBytes = clampInteger(options.maxBytes, DEFAULT_TAIL_BYTES, 1024, MAX_TAIL_BYTES)
    const maxLines = clampInteger(options.maxLines, DEFAULT_TAIL_LINES, 1, MAX_TAIL_LINES)
    const handle = await fs.promises.open(filePath, 'r')
    try {
      const { size: fileSize } = await handle.stat()
      const scanBytes = Math.min(fileSize, Math.max(64 * 1024, Math.min(maxBytes * 4, 1024 * 1024)))
      const scanOffset = Math.max(0, fileSize - scanBytes)
      const buffer = Buffer.alloc(scanBytes)
      const { bytesRead } = await handle.read(buffer, 0, scanBytes, scanOffset)
      let text = buffer.subarray(0, bytesRead).toString('utf8')
      if (scanOffset > 0) {
        const firstBreak = text.indexOf('\n')
        text = firstBreak >= 0 ? text.slice(firstBreak + 1) : ''
      }
      const allLines = text.split(/\r?\n/).filter(Boolean)
      const selected = takeLastLinesWithinBytes(allLines.slice(-maxLines), maxBytes)
      const content = selected.join('\n')
      const returnedBytes = Buffer.byteLength(content, 'utf8')
      return {
        sessionId,
        content,
        lineCount: selected.length,
        returnedBytes,
        fileSize,
        startOffset: Math.max(0, fileSize - returnedBytes),
        nextOffset: fileSize,
        truncatedBefore: selected.length < allLines.length || scanOffset > 0
      }
    } finally {
      await handle.close()
    }
  }

  async search(
    sessionId: string,
    query: string,
    options: {
      fromOffset?: number
      maxScanBytes?: number
      maxMatches?: number
      contextLines?: number
      caseSensitive?: boolean
    } = {}
  ): Promise<Record<string, unknown>> {
    const normalizedQuery = query.trim()
    if (!normalizedQuery || normalizedQuery.length > 256) {
      throw new Error('query must contain 1 to 256 characters')
    }
    const filePath = await this.requireLogPath(sessionId)
    const maxScanBytes = clampInteger(
      options.maxScanBytes,
      DEFAULT_SEARCH_BYTES,
      64 * 1024,
      MAX_SEARCH_BYTES
    )
    const maxMatches = clampInteger(options.maxMatches, 50, 1, 100)
    const contextLines = clampInteger(options.contextLines, 2, 0, 5)
    const handle = await fs.promises.open(filePath, 'r')
    try {
      const { size: fileSize } = await handle.stat()
      const requestedOffset =
        typeof options.fromOffset === 'number' && Number.isFinite(options.fromOffset)
          ? Math.max(0, Math.min(fileSize, Math.trunc(options.fromOffset)))
          : Math.max(0, fileSize - maxScanBytes)
      const bytesToRead = Math.min(maxScanBytes, fileSize - requestedOffset)
      const buffer = Buffer.alloc(bytesToRead)
      const { bytesRead } = await handle.read(buffer, 0, bytesToRead, requestedOffset)
      let text = buffer.subarray(0, bytesRead).toString('utf8')
      if (requestedOffset > 0) {
        const firstBreak = text.indexOf('\n')
        text = firstBreak >= 0 ? text.slice(firstBreak + 1) : ''
      }
      const lines = text.split(/\r?\n/)
      const needle = options.caseSensitive ? normalizedQuery : normalizedQuery.toLocaleLowerCase()
      const matches: SearchMatch[] = []
      let resultBytes = 0
      for (let index = 0; index < lines.length && matches.length < maxMatches; index++) {
        const haystack = options.caseSensitive ? lines[index] : lines[index].toLocaleLowerCase()
        if (!haystack.includes(needle)) continue
        const match: SearchMatch = {
          line: lines[index],
          before: lines.slice(Math.max(0, index - contextLines), index),
          after: lines.slice(index + 1, index + contextLines + 1)
        }
        const matchBytes = Buffer.byteLength(JSON.stringify(match), 'utf8')
        if (resultBytes + matchBytes > MAX_SEARCH_RESULTS_BYTES) break
        matches.push(match)
        resultBytes += matchBytes
      }

      const nextOffset = requestedOffset + bytesRead
      return {
        sessionId,
        query: normalizedQuery,
        matches,
        matchCount: matches.length,
        returnedBytes: resultBytes,
        scannedBytes: bytesRead,
        fromOffset: requestedOffset,
        nextOffset,
        fileSize,
        endReached: nextOffset >= fileSize,
        truncatedBefore: requestedOffset > 0
      }
    } finally {
      await handle.close()
    }
  }

  private async requireLogPath(sessionId: string): Promise<string> {
    const result = await this.resolver.getLogFilePath(sessionId)
    if (!result.success || !result.filePath) {
      throw new Error(result.message || `Log file not found for session: ${sessionId}`)
    }
    return result.filePath
  }
}
