/**
 * ITLDG.DataCheck 纯 TypeScript 实现
 * 从 C# 源码完整移植，包含 100+ 种 CRC 算法 + BCC/LRC/Checksum
 *
 * 原始项目: https://github.com/itldg/ITLDG.DataCheck
 * CRC 引擎参考: https://github.com/meetanthony/crcphp
 */

// ============================================================
// 工具函数
// ============================================================

/** 十六进制字符串 -> Uint8Array (如 "010304" -> [0x01,0x03,0x04]) */
function hexToBytes(hex: string): Uint8Array {
  hex = hex.replace(/\s/g, '')
  if (hex.length % 2 !== 0) hex = '0' + hex
  const len = hex.length / 2
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/** Uint8Array -> 十六进制字符串 (大写) */
function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16).toUpperCase()
    hex += h.length === 1 ? '0' + h : h
  }
  return hex
}

/** Uint8Array -> ASCII 字符串 */
function bytesToAscii(bytes: Uint8Array): string {
  let str = ''
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i])
  }
  return str
}

/** BigInt 按指定位宽反转 */
function reverseBits(value: bigint, bitLength: number): bigint {
  let result = 0n
  for (let i = bitLength - 1; i >= 0; i--) {
    result |= (value & 1n) << BigInt(i)
    value >>= 1n
  }
  return result
}

// ============================================================
// CRC 引擎 (移植自 C# CRC.Crc 类)
// ============================================================

interface CrcParams {
  name: string
  hashSize: number
  poly: bigint
  init: bigint
  refIn: boolean
  refOut: boolean
  xorOut: bigint
  /** 额外处理: 'swap16'=交换两字节, 'none'=无 */
  extra?: 'swap16' | 'none'
}

class CrcEngine {
  private mask: bigint
  private table: bigint[] = new Array(256)
  params: CrcParams

  constructor(params: CrcParams) {
    this.params = params
    this.mask = (1n << BigInt(params.hashSize)) - 1n
    this._buildTable()
  }

  private _buildTable(): void {
    for (let i = 0; i < 256; i++) {
      this.table[i] = this._buildTableEntry(i)
    }
  }

  private _buildTableEntry(index: number): bigint {
    let r = BigInt(index)
    if (this.params.refIn) {
      r = reverseBits(r, this.params.hashSize)
    } else if (this.params.hashSize > 8) {
      r <<= BigInt(this.params.hashSize - 8)
    }
    const lastBit = 1n << BigInt(this.params.hashSize - 1)
    for (let i = 0; i < 8; i++) {
      if ((r & lastBit) !== 0n) {
        r = ((r << 1n) ^ this.params.poly) & this.mask
      } else {
        r = (r << 1n) & this.mask
      }
    }
    if (this.params.refIn) {
      r = reverseBits(r, this.params.hashSize)
    }
    return r & this.mask
  }

  /** 计算 CRC */
  compute(data: Uint8Array): bigint {
    let currentValue = this.params.refIn
      ? reverseBits(this.params.init, this.params.hashSize)
      : this.params.init

    if (this.params.refIn) {
      for (let i = 0; i < data.length; i++) {
        const idx = Number((currentValue ^ BigInt(data[i])) & 0xFFn)
        currentValue = (this.table[idx] ^ (currentValue >> 8n)) & this.mask
      }
    } else {
      const toRight = BigInt(Math.max(this.params.hashSize - 8, 0))
      for (let i = 0; i < data.length; i++) {
        const idx = Number(((currentValue >> toRight) ^ BigInt(data[i])) & 0xFFn)
        currentValue = (this.table[idx] ^ (currentValue << 8n)) & this.mask
      }
    }

    if (this.params.refIn !== this.params.refOut) {
      currentValue = reverseBits(currentValue, this.params.hashSize)
    }

    return (currentValue ^ this.params.xorOut) & this.mask
  }
}

// ============================================================
// 非CRC算法实现 (BCC, LRC, Checksum)
// ============================================================

function computeBCC(data: Uint8Array): Uint8Array {
  let bcc = 0
  for (let i = 0; i < data.length; i++) {
    bcc ^= data[i]
  }
  return new Uint8Array([bcc])
}

function computeLRC(data: Uint8Array): Uint8Array {
  let lrc = 0
  for (let i = 0; i < data.length; i++) {
    lrc += data[i]
  }
  lrc = ((lrc ^ 0xff) + 1) & 0xff
  return new Uint8Array([lrc])
}

function computeAllAdd(data: Uint8Array): Uint8Array {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum += data[i]
  }
  return new Uint8Array([sum & 0xff])
}

function computeCheckSum65535(data: Uint8Array): Uint8Array {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum += data[i]
    if (sum > 65535) sum -= 65535
  }
  return new Uint8Array([(sum >> 8) & 0xff, sum & 0xff])
}

function computeCheckSum65535Diff(data: Uint8Array): Uint8Array {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum += data[i]
    if (sum > 65535) sum -= 65535
  }
  sum = 0x10000 - sum
  return new Uint8Array([(sum >> 8) & 0xff, sum & 0xff])
}

function computeCheckSumDiff(data: Uint8Array): Uint8Array {
  const r = computeAllAdd(data)
  r[0] = (0x100 - r[0]) & 0xff
  return r
}

/** 大端 BigInt -> 字节数组 (指定字节数) */
function bigintToBytes(value: bigint, byteLen: number): Uint8Array {
  const bytes = new Uint8Array(byteLen)
  for (let i = byteLen - 1; i >= 0; i--) {
    bytes[i] = Number(value & 0xFFn)
    value >>= 8n
  }
  return bytes
}

// ============================================================
// 所有算法注册表 (参数来自 C# 源码逐行提取)
// ============================================================

interface Algorithm {
  name: string
  type: 'crc' | 'native'
  /** 对输入数据计算校验，返回字节数组 */
  compute: (data: Uint8Array) => Uint8Array
  /** 返回结果的详细信息 */
  resultDetails?: (result: Uint8Array) => { name: string; value: string; type: string }[]
}

/** CRC 参数表 (100项) */
const CRC_PARAMS: CrcParams[] = [
  // CRC-3
  { name: 'CRC-3/GSM', hashSize: 3, poly: 0x03n, init: 0x00n, refIn: false, refOut: false, xorOut: 0x07n },
  { name: 'CRC-3/ROHC', hashSize: 3, poly: 0x03n, init: 0x07n, refIn: true, refOut: true, xorOut: 0x00n },
  // CRC-4
  { name: 'CRC-4/INTERLAKEN', hashSize: 4, poly: 0x03n, init: 0x0Fn, refIn: false, refOut: false, xorOut: 0x0Fn },
  { name: 'CRC-4/ITU', hashSize: 4, poly: 0x03n, init: 0x00n, refIn: true, refOut: true, xorOut: 0x00n },
  // CRC-5
  { name: 'CRC-5/EPC', hashSize: 5, poly: 0x09n, init: 0x09n, refIn: false, refOut: false, xorOut: 0x00n },
  { name: 'CRC-5/ITU', hashSize: 5, poly: 0x15n, init: 0x00n, refIn: true, refOut: true, xorOut: 0x00n },
  { name: 'CRC-5/USB', hashSize: 5, poly: 0x05n, init: 0x1Fn, refIn: true, refOut: true, xorOut: 0x1Fn },
  // CRC-6
  { name: 'CRC-6/CDMA2000-A', hashSize: 6, poly: 0x27n, init: 0x3Fn, refIn: false, refOut: false, xorOut: 0x00n },
  { name: 'CRC-6/CDMA2000-B', hashSize: 6, poly: 0x07n, init: 0x3Fn, refIn: false, refOut: false, xorOut: 0x00n },
  { name: 'CRC-6/DARC', hashSize: 6, poly: 0x19n, init: 0x00n, refIn: true, refOut: true, xorOut: 0x00n },
  { name: 'CRC-6/GSM', hashSize: 6, poly: 0x2Fn, init: 0x00n, refIn: false, refOut: false, xorOut: 0x3Fn },
  { name: 'CRC-6/ITU', hashSize: 6, poly: 0x03n, init: 0x00n, refIn: true, refOut: true, xorOut: 0x00n },
  // CRC-7
  { name: 'CRC-7', hashSize: 7, poly: 0x09n, init: 0x00n, refIn: false, refOut: false, xorOut: 0x00n },
  { name: 'CRC-7/ROHC', hashSize: 7, poly: 0x4Fn, init: 0x7Fn, refIn: true, refOut: true, xorOut: 0x00n },
  { name: 'CRC-7/UMTS', hashSize: 7, poly: 0x45n, init: 0x00n, refIn: false, refOut: false, xorOut: 0x00n },
  // CRC-8
  { name: 'CRC-8/AUTOSAR', hashSize: 8, poly: 0x2Fn, init: 0xFFn, refIn: false, refOut: false, xorOut: 0xFFn },
  { name: 'CRC-8/BLUETOOTH', hashSize: 8, poly: 0xA7n, init: 0x00n, refIn: true, refOut: true, xorOut: 0x00n },
  { name: 'CRC-8/CDMA2000', hashSize: 8, poly: 0x9Bn, init: 0xFFn, refIn: false, refOut: false, xorOut: 0x00n },
  { name: 'CRC-8/DARC', hashSize: 8, poly: 0x39n, init: 0x00n, refIn: true, refOut: true, xorOut: 0x00n },
  { name: 'CRC-8/DVB-S2', hashSize: 8, poly: 0xD5n, init: 0x00n, refIn: false, refOut: false, xorOut: 0x00n },
  { name: 'CRC-8/EBU', hashSize: 8, poly: 0x1Dn, init: 0xFFn, refIn: true, refOut: true, xorOut: 0x00n },
  { name: 'CRC-8/GSM-A', hashSize: 8, poly: 0x1Dn, init: 0x00n, refIn: false, refOut: false, xorOut: 0x00n },
  { name: 'CRC-8/GSM-B', hashSize: 8, poly: 0x49n, init: 0x00n, refIn: false, refOut: false, xorOut: 0xFFn },
  { name: 'CRC-8/I-CODE', hashSize: 8, poly: 0x1Dn, init: 0xFDn, refIn: false, refOut: false, xorOut: 0x00n },
  { name: 'CRC-8/ITU', hashSize: 8, poly: 0x07n, init: 0x00n, refIn: false, refOut: false, xorOut: 0x55n },
  { name: 'CRC-8/LTE', hashSize: 8, poly: 0x9Bn, init: 0x00n, refIn: false, refOut: false, xorOut: 0x00n },
  { name: 'CRC-8/MAXIM', hashSize: 8, poly: 0x31n, init: 0x00n, refIn: true, refOut: true, xorOut: 0x00n },
  { name: 'CRC-8/NRSC-5', hashSize: 8, poly: 0x31n, init: 0xFFn, refIn: false, refOut: false, xorOut: 0x00n },
  { name: 'CRC-8/OPENSAFETY', hashSize: 8, poly: 0x2Fn, init: 0x00n, refIn: false, refOut: false, xorOut: 0x00n },
  { name: 'CRC-8/ROHC', hashSize: 8, poly: 0x07n, init: 0xFFn, refIn: true, refOut: true, xorOut: 0x00n },
  { name: 'CRC-8/SAE-J1850', hashSize: 8, poly: 0x1Dn, init: 0xFFn, refIn: false, refOut: false, xorOut: 0xFFn },
  { name: 'CRC-8/SMBUS', hashSize: 8, poly: 0x07n, init: 0x00n, refIn: false, refOut: false, xorOut: 0x00n },
  { name: 'CRC-8/WCDMA', hashSize: 8, poly: 0x9Bn, init: 0x00n, refIn: true, refOut: true, xorOut: 0x00n },
  // CRC-10
  { name: 'CRC-10/ATM', hashSize: 10, poly: 0x0233n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-10/CDMA2000', hashSize: 10, poly: 0x03D9n, init: 0x03FFn, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-10/GSM', hashSize: 10, poly: 0x0175n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x03FFn },
  // CRC-11
  { name: 'CRC-11/FLEXRAY', hashSize: 11, poly: 0x0385n, init: 0x001An, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-11/UMTS', hashSize: 11, poly: 0x0307n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0000n },
  // CRC-12
  { name: 'CRC-12/CDMA2000', hashSize: 12, poly: 0x0F13n, init: 0x0FFFn, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-12/DECT', hashSize: 12, poly: 0x080Fn, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-12/GSM', hashSize: 12, poly: 0x0D31n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0FFFn },
  { name: 'CRC-12/UMTS', hashSize: 12, poly: 0x080Fn, init: 0x0000n, refIn: false, refOut: true, xorOut: 0x0000n },
  // CRC-13
  { name: 'CRC-13/BBC', hashSize: 13, poly: 0x1CF5n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0000n },
  // CRC-14
  { name: 'CRC-14/DARC', hashSize: 14, poly: 0x0805n, init: 0x0000n, refIn: true, refOut: true, xorOut: 0x0000n },
  { name: 'CRC-14/GSM', hashSize: 14, poly: 0x202Dn, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x3FFFn },
  // CRC-15
  { name: 'CRC-15/CAN', hashSize: 15, poly: 0x4599n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-15/MPT1327', hashSize: 15, poly: 0x6815n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0001n },
  // CRC-16
  { name: 'CRC-16/AUG-CCITT', hashSize: 16, poly: 0x1021n, init: 0x1D0Fn, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-16/BUYPASS', hashSize: 16, poly: 0x8005n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-16/CCITT-FALSE', hashSize: 16, poly: 0x1021n, init: 0xFFFFn, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-16/CDMA2000', hashSize: 16, poly: 0xC867n, init: 0xFFFFn, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-16/CMS', hashSize: 16, poly: 0x8005n, init: 0xFFFFn, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-16/CRC-A', hashSize: 16, poly: 0x1021n, init: 0xC6C6n, refIn: true, refOut: true, xorOut: 0x0000n },
  { name: 'CRC-16/DDS-110', hashSize: 16, poly: 0x8005n, init: 0x800Dn, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-16/DECT-R', hashSize: 16, poly: 0x0589n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0001n },
  { name: 'CRC-16/DECT-X', hashSize: 16, poly: 0x0589n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-16/DNP', hashSize: 16, poly: 0x3D65n, init: 0x0000n, refIn: true, refOut: true, xorOut: 0xFFFFn },
  { name: 'CRC-16/EN13757', hashSize: 16, poly: 0x3D65n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0xFFFFn },
  { name: 'CRC-16/GENIBUS', hashSize: 16, poly: 0x1021n, init: 0xFFFFn, refIn: false, refOut: false, xorOut: 0xFFFFn },
  { name: 'CRC-16/GSM', hashSize: 16, poly: 0x1021n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0xFFFFn },
  { name: 'CRC-16/IBM', hashSize: 16, poly: 0x8005n, init: 0x0000n, refIn: true, refOut: true, xorOut: 0x0000n },
  { name: 'CRC-16/KERMIT', hashSize: 16, poly: 0x1021n, init: 0x0000n, refIn: true, refOut: true, xorOut: 0x0000n },
  { name: 'CRC-16/LJ1200', hashSize: 16, poly: 0x6F63n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-16/MAXIM', hashSize: 16, poly: 0x8005n, init: 0x0000n, refIn: true, refOut: true, xorOut: 0xFFFFn },
  { name: 'CRC-16/MCRF4XX', hashSize: 16, poly: 0x1021n, init: 0xFFFFn, refIn: true, refOut: true, xorOut: 0x0000n },
  { name: 'CRC-16/MODBUS', hashSize: 16, poly: 0x8005n, init: 0xFFFFn, refIn: true, refOut: true, xorOut: 0x0000n },
  { name: 'CRC-16/MODBUS-LE', hashSize: 16, poly: 0x8005n, init: 0xFFFFn, refIn: true, refOut: true, xorOut: 0x0000n, extra: 'swap16' },
  { name: 'CRC-16/MODBUS 默纳克7000', hashSize: 16, poly: 0x8005n, init: 0xFFFFn, refIn: true, refOut: true, xorOut: 0x0000n },
  { name: 'CRC-16/OPENSAFETY-A', hashSize: 16, poly: 0x5935n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-16/OPENSAFETY-B', hashSize: 16, poly: 0x755Bn, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-16/PROFIBUS', hashSize: 16, poly: 0x1DCFn, init: 0xFFFFn, refIn: false, refOut: false, xorOut: 0xFFFFn },
  { name: 'CRC-16/RIELLO', hashSize: 16, poly: 0x1021n, init: 0xB2AAn, refIn: true, refOut: true, xorOut: 0x0000n },
  { name: 'CRC-16/T10-DIF', hashSize: 16, poly: 0x8BB7n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-16/TELEDISK', hashSize: 16, poly: 0xA097n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0000n },
  { name: 'CRC-16/TMS37157', hashSize: 16, poly: 0x1021n, init: 0x89ECn, refIn: true, refOut: true, xorOut: 0x0000n },
  { name: 'CRC-16/USB', hashSize: 16, poly: 0x8005n, init: 0xFFFFn, refIn: true, refOut: true, xorOut: 0xFFFFn },
  { name: 'CRC-16/X-25', hashSize: 16, poly: 0x1021n, init: 0xFFFFn, refIn: true, refOut: true, xorOut: 0xFFFFn },
  { name: 'CRC-16/XMODEM', hashSize: 16, poly: 0x1021n, init: 0x0000n, refIn: false, refOut: false, xorOut: 0x0000n },
  // CRC-17
  { name: 'CRC-17/CAN-FD', hashSize: 17, poly: 0x1685Bn, init: 0x00000n, refIn: false, refOut: false, xorOut: 0x00000n },
  // CRC-21
  { name: 'CRC-21/CAN-FD', hashSize: 21, poly: 0x102899n, init: 0x000000n, refIn: false, refOut: false, xorOut: 0x000000n },
  // CRC-24
  { name: 'CRC-24/BLE', hashSize: 24, poly: 0x00065Bn, init: 0x555555n, refIn: true, refOut: true, xorOut: 0x000000n },
  { name: 'CRC-24/FLEXRAY-A', hashSize: 24, poly: 0x5D6DCBn, init: 0xFEDCBAn, refIn: false, refOut: false, xorOut: 0x000000n },
  { name: 'CRC-24/FLEXRAY-B', hashSize: 24, poly: 0x5D6DCBn, init: 0xABCDEFn, refIn: false, refOut: false, xorOut: 0x000000n },
  { name: 'CRC-24/INTERLAKEN', hashSize: 24, poly: 0x328B63n, init: 0xFFFFFFn, refIn: false, refOut: false, xorOut: 0xFFFFFFn },
  { name: 'CRC-24/LTE-A', hashSize: 24, poly: 0x864CFBn, init: 0x000000n, refIn: false, refOut: false, xorOut: 0x000000n },
  { name: 'CRC-24/LTE-B', hashSize: 24, poly: 0x800063n, init: 0x000000n, refIn: false, refOut: false, xorOut: 0x000000n },
  { name: 'CRC-24/OPENPGP', hashSize: 24, poly: 0x864CFBn, init: 0xB704CEn, refIn: false, refOut: false, xorOut: 0x000000n },
  { name: 'CRC-24/OS-9', hashSize: 24, poly: 0x800063n, init: 0xFFFFFFn, refIn: false, refOut: false, xorOut: 0xFFFFFFn },
  // CRC-30
  { name: 'CRC-30/CDMA', hashSize: 30, poly: 0x2030B9C7n, init: 0x3FFFFFFFn, refIn: false, refOut: false, xorOut: 0x3FFFFFFFn },
  // CRC-31
  { name: 'CRC-31/PHILLIPS', hashSize: 31, poly: 0x04C11DB7n, init: 0x7FFFFFFFn, refIn: false, refOut: false, xorOut: 0x7FFFFFFFn },
  // CRC-32
  { name: 'CRC-32', hashSize: 32, poly: 0x04C11DB7n, init: 0xFFFFFFFFn, refIn: true, refOut: true, xorOut: 0xFFFFFFFFn },
  { name: 'CRC-32/AUTOSAR', hashSize: 32, poly: 0xF4ACFB13n, init: 0xFFFFFFFFn, refIn: true, refOut: true, xorOut: 0xFFFFFFFFn },
  { name: 'CRC-32/BZIP2', hashSize: 32, poly: 0x04C11DB7n, init: 0xFFFFFFFFn, refIn: false, refOut: false, xorOut: 0xFFFFFFFFn },
  { name: 'CRC-32/C', hashSize: 32, poly: 0x1EDC6F41n, init: 0xFFFFFFFFn, refIn: true, refOut: true, xorOut: 0xFFFFFFFFn },
  { name: 'CRC-32/D', hashSize: 32, poly: 0xA833982Bn, init: 0xFFFFFFFFn, refIn: true, refOut: true, xorOut: 0xFFFFFFFFn },
  { name: 'CRC-32/JAMCRC', hashSize: 32, poly: 0x04C11DB7n, init: 0xFFFFFFFFn, refIn: true, refOut: true, xorOut: 0x00000000n },
  { name: 'CRC-32/MPEG-2', hashSize: 32, poly: 0x04C11DB7n, init: 0xFFFFFFFFn, refIn: false, refOut: false, xorOut: 0x00000000n },
  { name: 'CRC-32/POSIX', hashSize: 32, poly: 0x04C11DB7n, init: 0x00000000n, refIn: false, refOut: false, xorOut: 0xFFFFFFFFn },
  { name: 'CRC-32/Q', hashSize: 32, poly: 0x814141ABn, init: 0x00000000n, refIn: false, refOut: false, xorOut: 0x00000000n },
  { name: 'CRC-32/XFER', hashSize: 32, poly: 0x000000AFn, init: 0x00000000n, refIn: false, refOut: false, xorOut: 0x00000000n },
  // CRC-40
  { name: 'CRC-40/GSM', hashSize: 40, poly: 0x0004820009n, init: 0x0000000000n, refIn: false, refOut: false, xorOut: 0xFFFFFFFFFFn },
  // CRC-64
  { name: 'CRC-64/ECMA-182', hashSize: 64, poly: 0x42F0E1EBA9EA3693n, init: 0x0000000000000000n, refIn: false, refOut: false, xorOut: 0x0000000000000000n },
  { name: 'CRC-64/GO-ISO', hashSize: 64, poly: 0x000000000000001Bn, init: 0xFFFFFFFFFFFFFFFFn, refIn: true, refOut: true, xorOut: 0xFFFFFFFFFFFFFFFFn },
  { name: 'CRC-64/WE', hashSize: 64, poly: 0x42F0E1EBA9EA3693n, init: 0xFFFFFFFFFFFFFFFFn, refIn: false, refOut: false, xorOut: 0xFFFFFFFFFFFFFFFFn },
  { name: 'CRC-64/XZ', hashSize: 64, poly: 0x42F0E1EBA9EA3693n, init: 0xFFFFFFFFFFFFFFFFn, refIn: true, refOut: true, xorOut: 0xFFFFFFFFFFFFFFFFn },
]

/** 构建算法注册表 */
function buildAlgorithmRegistry(): Map<string, Algorithm> {
  const map = new Map<string, Algorithm>()

  // ---- CRC 算法 ----
  for (const params of CRC_PARAMS) {
    const engine = new CrcEngine(params)
    const byteLen = Math.ceil(params.hashSize / 8)

    map.set(params.name, {
      name: params.name,
      type: 'crc',
      compute: (data: Uint8Array): Uint8Array => {
        const result = engine.compute(data)
        const bytes = bigintToBytes(result, byteLen)
        // 特殊处理 MODBUS-LE (小端字节序)
        if (params.extra === 'swap16' && bytes.length === 2) {
          return new Uint8Array([bytes[1], bytes[0]])
        }
        return bytes
      }
    })
  }

  // ---- 非CRC算法 (1字节) ----
  const native1byte: [string, (d: Uint8Array) => Uint8Array][] = [
    ['BCC(异或校验)', computeBCC],
    ['LRC(纵向冗余校验)', computeLRC],
    ['累加和校验', computeAllAdd],
    ['累加和校验( 0x100 - Sum 的差值)', computeCheckSumDiff],
  ]
  for (const [name, fn] of native1byte) {
    map.set(name, { name, type: 'native', compute: fn })
  }

  // ---- 非CRC算法 (2字节) ----
  const native2byte: [string, (d: Uint8Array) => Uint8Array][] = [
    ['累加和校验(最大65535)', computeCheckSum65535],
    ['累加和校验( 0x10000 - Sum 的差值)', computeCheckSum65535Diff],
  ]
  for (const [name, fn] of native2byte) {
    map.set(name, { name, type: 'native', compute: fn })
  }

  return map
}

// ============================================================
// 导出 API
// ============================================================

const registry = buildAlgorithmRegistry()

export interface PluginInfo {
  name: string
  type: string // 'crc' | 'native'
}

export interface CheckResultDetail {
  resultName: string
  resultValue: string
  resultType: string
}

export interface CheckDataResult {
  plugin: string
  hexResult: string
  details: CheckResultDetail[]
}

/** 获取所有算法列表 */
export function getPlugins(): PluginInfo[] {
  const result: PluginInfo[] = []
  registry.forEach((algo, name) => {
    result.push({ name, type: algo.type })
  })
  return result
}

/** 用指定算法计算校验值 */
export function checkData(pluginName: string, hexData: string): CheckDataResult {
  const algo = registry.get(pluginName)
  if (!algo) {
    throw new Error(`未知算法: ${pluginName}`)
  }

  const dataBytes = hexToBytes(hexData)
  const resultBytes = algo.compute(dataBytes)
  const hexResult = bytesToHex(resultBytes)

  // 构建详细信息 (模仿 C# ByteResultToCheckResult)
  const details: CheckResultDetail[] = []
  details.push({ resultName: '校验结果 HEX', resultValue: hexResult, resultType: 'hex' })

  // HEX -> ASCII
  const ascii = bytesToAscii(resultBytes)
  details.push({ resultName: '校验结果 HEX2ASCII', resultValue: ascii, resultType: 'hex' })

  // 十进制值
  try {
    const dec = BigInt('0x' + hexResult).toString(10)
    details.push({ resultName: '校验结果 Dec', resultValue: dec, resultType: 'dec' })
  } catch {
    // ignore
  }

  return { plugin: pluginName, hexResult, details }
}
