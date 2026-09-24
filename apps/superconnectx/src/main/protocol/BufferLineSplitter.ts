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
   * 解码可安全输出的完整字符，并返回需要留到下一批的残缺字节。
   * 用于 Telnet 超长无换行数据的有界刷新。
   */
  decodeCompletePrefix(buffer: Buffer): { text: string; remainder: Buffer } {
    if (this.receiveHex || buffer.length === 0) {
      return { text: this.decodeFull(buffer), remainder: Buffer.alloc(0) }
    }

    const encoding = this.encoding.toLowerCase().replace(/_/g, '-')
    let splitAt = buffer.length

    if (['utf8', 'utf-8'].includes(encoding)) {
      splitAt = this.getUtf8CompleteLength(buffer)
    } else if (['utf16le', 'utf-16le', 'ucs2', 'ucs-2'].includes(encoding)) {
      splitAt = this.getUtf16CompleteLength(buffer, true)
    } else if (['utf16be', 'utf-16be'].includes(encoding)) {
      splitAt = this.getUtf16CompleteLength(buffer, false)
    } else if (encoding === 'gb18030') {
      splitAt = this.getGb18030CompleteLength(buffer)
    } else if (['gbk', 'cp936'].includes(encoding)) {
      splitAt = this.getDbcsCompleteLength(buffer, (byte) => byte >= 0x81 && byte <= 0xfe)
    } else if (['gb2312', 'euc-cn'].includes(encoding)) {
      splitAt = this.getDbcsCompleteLength(buffer, (byte) => byte >= 0xa1 && byte <= 0xf7)
    } else if (['big5', 'big-5', 'cp950'].includes(encoding)) {
      splitAt = this.getDbcsCompleteLength(buffer, (byte) => byte >= 0x81 && byte <= 0xfe)
    } else if (['shift-jis', 'shiftjis', 'sjis', 'cp932'].includes(encoding)) {
      splitAt = this.getDbcsCompleteLength(
        buffer,
        (byte) => (byte >= 0x81 && byte <= 0x9f) || (byte >= 0xe0 && byte <= 0xfc)
      )
    } else if (['euc-kr', 'euckr', 'cp949'].includes(encoding)) {
      splitAt = this.getDbcsCompleteLength(buffer, (byte) => byte >= 0x81 && byte <= 0xfe)
    }

    return {
      text: this.decodeBuffer(buffer, 0, splitAt),
      // Buffer.subarray() 会继续引用整个大 Buffer，复制后才能真正释放它。
      remainder: Buffer.from(buffer.subarray(splitAt))
    }
  }

  private getUtf8CompleteLength(buffer: Buffer): number {
    let sequenceStart = buffer.length - 1
    while (sequenceStart >= 0 && (buffer[sequenceStart] & 0xc0) === 0x80) {
      sequenceStart--
    }

    if (sequenceStart < 0) {
      // 全部是孤立的 continuation byte，属于非法 UTF-8；直接按替代字符输出，
      // 不能把异常输入永久留在有界缓冲区中。
      return buffer.length
    }

    const leadByte = buffer[sequenceStart]
    const expectedLength = leadByte < 0x80 ? 1
      : (leadByte & 0xe0) === 0xc0 ? 2
        : (leadByte & 0xf0) === 0xe0 ? 3
          : (leadByte & 0xf8) === 0xf0 ? 4
            : 1
    const completeLength = buffer.length - sequenceStart
    return completeLength < expectedLength ? sequenceStart : buffer.length
  }

  private getUtf16CompleteLength(buffer: Buffer, littleEndian: boolean): number {
    let length = buffer.length - (buffer.length % 2)
    if (length < 2) return 0

    const lastCodeUnit = littleEndian
      ? buffer.readUInt16LE(length - 2)
      : buffer.readUInt16BE(length - 2)
    if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
      length -= 2
    }
    return length
  }

  private getDbcsCompleteLength(buffer: Buffer, isLeadByte: (byte: number) => boolean): number {
    let offset = 0
    while (offset < buffer.length) {
      if (!isLeadByte(buffer[offset])) {
        offset++
      } else if (offset + 1 >= buffer.length) {
        return offset
      } else {
        offset += 2
      }
    }
    return offset
  }

  private getGb18030CompleteLength(buffer: Buffer): number {
    let offset = 0
    while (offset < buffer.length) {
      const first = buffer[offset]
      if (first <= 0x7f || first === 0x80 || first === 0xff) {
        offset++
        continue
      }
      if (first < 0x81 || first > 0xfe) {
        offset++
        continue
      }
      if (offset + 1 >= buffer.length) return offset

      const second = buffer[offset + 1]
      if (second >= 0x30 && second <= 0x39) {
        if (offset + 3 >= buffer.length) return offset
        offset += 4
      } else {
        offset += 2
      }
    }
    return offset
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

    const normalizedEncoding = this.encoding.toLowerCase().replace(/_/g, '-')
    if (['utf16le', 'utf-16le', 'ucs2', 'ucs-2'].includes(normalizedEncoding)) {
      return this.splitUtf16(buffer, true)
    }
    if (['utf16be', 'utf-16be'].includes(normalizedEncoding)) {
      return this.splitUtf16(buffer, false)
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

  private splitUtf16(buffer: Buffer, littleEndian: boolean): LineSplitResult {
    const dataLines: string[] = []
    const logLines: string[] = []
    const completeLength = buffer.length - (buffer.length % 2)
    let offset = 0

    for (let pos = 0; pos < completeLength; pos += 2) {
      const codeUnit = littleEndian ? buffer.readUInt16LE(pos) : buffer.readUInt16BE(pos)
      if (codeUnit !== 0x0d && codeUnit !== 0x0a) continue

      const line = this.decodeBuffer(buffer, offset, pos)
      if (line) {
        dataLines.push(line)
        logLines.push(this.toLogLine(line))
      }

      if (codeUnit === 0x0d && pos + 3 < completeLength) {
        const next = littleEndian ? buffer.readUInt16LE(pos + 2) : buffer.readUInt16BE(pos + 2)
        if (next === 0x0a) pos += 2
      }
      offset = pos + 2
    }

    return {
      data: dataLines.join('\n'),
      log: logLines.join('\n'),
      count: dataLines.length,
      remainder: Buffer.from(buffer.subarray(offset))
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
