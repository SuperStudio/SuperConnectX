/**
 * Buffer 行分割器
 * 在原始 Buffer 中查找换行符再解码，彻底避免多字节字符被 data 事件分割导致数据损坏
 */
import * as iconv from 'iconv-lite'

/** Node.js 原生支持的 Buffer 编码 */
const NATIVE_ENCODINGS = new Set([
  'ascii', 'utf8', 'utf-8', 'utf16le', 'ucs2', 'ucs-2',
  'base64', 'base64url', 'latin1', 'binary', 'hex'
])

export interface LineSplitResult {
  /** 合并后的行文本（用 \n 拼接） */
  data: string
  /** 日志用的行文本（用 \n 拼接） */
  log: string
  /** 合并后总的行数 */
  count: number
  /** 剩余的未完成字节 */
  remainder: Buffer
}

export class BufferLineSplitter {
  private encoding: string
  private receiveHex: boolean

  constructor(encoding: string = 'utf8', receiveHex: boolean = false) {
    this.encoding = encoding
    this.receiveHex = receiveHex
  }

  updateEncoding(encoding: string): void {
    this.encoding = encoding
  }

  updateReceiveHex(receiveHex: boolean): void {
    this.receiveHex = receiveHex
  }

  /**
   * 将整个 Buffer 解码为字符串（不分行）。
   * 用于空闲超时刷新等场景。
   */
  decodeFull(buffer: Buffer): string {
    return this.decodeBuffer(buffer, 0, buffer.length)
  }

  /**
   * 将 Buffer 片段解码为字符串。
   * - HEX 模式：直接输出 hex 字符串（如 "aa 22 0d 0a 61 05"），不经过任何字符编码层
   * - STR 模式：按 encoding 解码（utf8/gb2312/gbk 等）
   */
  private decodeBuffer(buffer: Buffer, start: number, end: number): string {
    if (this.receiveHex) {
      // HEX 模式：直接逐字节转 hex（大写），不经过任何字符编码
      let hex = ''
      for (let i = start; i < end; i++) {
        hex += buffer[i].toString(16).padStart(2, '0').toUpperCase() + ' '
      }
      return hex.trimEnd()
    }

    // STR 模式：按 encoding 解码
    if (NATIVE_ENCODINGS.has(this.encoding)) {
      return buffer.toString(this.encoding as BufferEncoding, start, end)
    }
    try {
      return iconv.decode(buffer.subarray(start, end), this.encoding)
    } catch {
      return buffer.toString('latin1', start, end)
    }
  }

  /**
   * 从 Buffer 中提取所有完整的行
   * 支持 \r\n、\r、\n 三种换行符
   * HEX 模式下不做行切割，直接输出整个 buffer 的 hex（换行符也是有效数据）
   */
  split(buffer: Buffer): LineSplitResult {
    if (!buffer || buffer.length === 0) {
      return { data: '', log: '', count: 0, remainder: Buffer.alloc(0) }
    }

    // HEX 模式：不切割行，整个 buffer 直接转 hex，包含换行符字节
    if (this.receiveHex) {
      const hexData = this.decodeBuffer(buffer, 0, buffer.length)
      return {
        data: hexData,
        log: hexData,
        count: hexData ? 1 : 0,
        remainder: Buffer.alloc(0)
      }
    }

    const CR = 0x0d
    const LF = 0x0a
    const dataLines: string[] = []
    const logLines: string[] = []
    let offset = 0
    const bufLen = buffer.length

    while (offset < bufLen) {
      const crPos = buffer.indexOf(CR, offset)

      // 没有找到 \r，尝试找单独的 \n
      if (crPos === -1) {
        const lfPos = buffer.indexOf(LF, offset)
        if (lfPos === -1) break

        const line = this.decodeBuffer(buffer, offset, lfPos)
        offset = lfPos + 1
        if (line) {
          dataLines.push(line)
          logLines.push(this.toLogLine(line))
        }
        continue
      }

      // 检查 \r\n 组合
      if (crPos + 1 < bufLen && buffer[crPos + 1] === LF) {
        const line = this.decodeBuffer(buffer, offset, crPos)
        offset = crPos + 2
        if (line) {
          dataLines.push(line)
          logLines.push(this.toLogLine(line))
        }
      } else if (crPos === bufLen - 1) {
        // \r 是 buffer 的最后一个字节，可能是 \r\n 被分片，
        // 不处理，留给 remainder 等下一个 chunk 到达后再判断
        break
      } else {
        // 单独的 \r（后面不是 \n 且不是 buffer 末尾）
        const line = this.decodeBuffer(buffer, offset, crPos)
        offset = crPos + 1
        if (line) {
          dataLines.push(line)
          logLines.push(this.toLogLine(line))
        }
      }
    }

    const resultData = dataLines.length > 0 ? dataLines.join('\n') : ''
    const resultLog = logLines.length > 0 ? logLines.join('\n') : ''
    const resultRemainder = offset < bufLen ? buffer.subarray(offset) : Buffer.alloc(0)

    return {
      data: resultData,
      log: resultLog,
      count: dataLines.length,
      remainder: resultRemainder
    }
  }

  /** 将一行文本转换为日志格式（HEX 模式下 line 已经是 hex 字符串，原样返回） */
  toLogLine(line: string): string {
    if (!this.receiveHex) return line
    // HEX 模式下 decodeBuffer 已经输出 hex 字符串，直接返回即可
    return line
  }

  /** 生成时间戳：YYYY-MM-DD HH:mm:ss.mmm */
  static timestamp(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`
  }
}
