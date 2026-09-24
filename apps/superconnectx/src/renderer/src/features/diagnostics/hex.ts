/**
 * 诊断数据校验域：HEX / 二进制编解码纯工具。
 * 不依赖 window / IPC，可在任意环境进行单元测试。
 */

/** 去除字符串中的空白字符（空格、换行、回车、制表等） */
export function stripWhitespace(value: string): string {
  return value.replace(/[\s\n\r]+/g, '')
}

/** 判断是否为合法 HEX 字符串（仅十六进制字符且字节成对，即偶数长度） */
export function isValidHex(hex: string): boolean {
  const cleaned = stripWhitespace(hex)
  return /^[0-9A-Fa-f]*$/.test(cleaned) && cleaned.length % 2 === 0
}

/** HEX 字符串 → 字节数组（先去除空白，未对合法性做断言） */
export function hexToUint8Array(hex: string): Uint8Array {
  const cleaned = stripWhitespace(hex)
  const bytes = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.substring(i, i + 2), 16)
  }
  return bytes
}

/** 字节数组 → 大端 HEX 字符串（默认大写） */
export function uint8ArrayToHex(bytes: Uint8Array, uppercase = true): string {
  const alphabet = uppercase ? '0123456789ABCDEF' : '0123456789abcdef'
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] >> 4] + alphabet[bytes[i] & 0x0f]
  }
  return out
}

/** HEX 字符串 → 按字节以空格分隔的展示文本（保留输入大小写） */
export function hexToSpacedHex(hex: string): string {
  const cleaned = stripWhitespace(hex)
  const parts: string[] = []
  for (let i = 0; i < cleaned.length; i += 2) {
    parts.push(cleaned.substring(i, i + 2))
  }
  return parts.join(' ')
}

/** 字节数组 → 二进制字符串（每字节映射一个 char code，用于直接拼接发送） */
export function uint8ArrayToBinaryString(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i])
  }
  return out
}

/** HEX 字符串 → 二进制字符串（每字节映射一个 char code） */
export function hexToBinaryString(hex: string): string {
  return uint8ArrayToBinaryString(hexToUint8Array(hex))
}
