export interface CommandPreparationOptions {
  autoNewline?: boolean
  hexMode?: boolean
  crcEnabled?: boolean
  crcMethod?: string
}

export interface PreparedCommand {
  input: string
  data: string
  displayCommand: string
  byteLength: number
  hexMode: boolean
}

export type ChecksumCalculator = (hexData: string, method: string) => Promise<string | null>

/**
 * 将用户输入的 HEX 文本转换为待发送的二进制字符串。
 * 空格和换行仅用于提高输入可读性；非法字符或不完整字节必须在发送前拒绝。
 */
function parseHexString(input: string): string {
  const cleaned = input.replace(/[\s\n\r]+/g, '')
  if (!/^[0-9A-Fa-f]*$/.test(cleaned) || cleaned.length % 2 !== 0) {
    throw new Error('Invalid HEX command')
  }

  let result = ''
  for (let index = 0; index < cleaned.length; index += 2) {
    result += String.fromCharCode(parseInt(cleaned.substring(index, index + 2), 16))
  }
  return result
}

function toHexDisplay(value: string): string {
  return Array.from(value)
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
}

/**
 * 将用户在命令框输入的内容转换为软件实际发送的数据。
 * GUI 和 AI 发送都使用这个函数，避免一方漏掉自动换行、HEX 或 CRC 规则。
 */
export async function prepareCommand(
  input: string,
  options: CommandPreparationOptions = {},
  calculateChecksum?: ChecksumCalculator
): Promise<PreparedCommand> {
  if (!input.trim()) throw new Error('Command must not be empty')

  const autoNewline = options.autoNewline !== false
  const hexMode = options.hexMode === true
  const crcEnabled = options.crcEnabled !== false
  const crcMethod = options.crcMethod || 'CRC-16/MODBUS'
  let data = input

  if (hexMode) {
    const cleaned = input.trim().replace(/[\s\n\r]+/g, '')
    data = parseHexString(input)
    let crcInputHex = cleaned

    // CRLF 属于实际发送数据，因此启用自动换行时也必须参与 CRC 计算。
    if (autoNewline) {
      data += '\r\n'
      crcInputHex += '0D0A'
    }

    // CRC 必须追加在完整原始数据之后；GUI 与 AI 共用此顺序，避免发送结果不一致。
    if (crcEnabled && calculateChecksum) {
      const crcHex = await calculateChecksum(crcInputHex, crcMethod)
      if (crcHex) data += parseHexString(crcHex)
    }
  } else if (autoNewline) {
    data += '\r\n'
  }

  return {
    input,
    data,
    displayCommand: hexMode ? toHexDisplay(data) : input,
    byteLength: new TextEncoder().encode(data).length,
    hexMode
  }
}
