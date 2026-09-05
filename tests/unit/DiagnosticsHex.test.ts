import { describe, it, expect } from 'vitest'
import {
  stripWhitespace,
  isValidHex,
  hexToUint8Array,
  uint8ArrayToHex,
  hexToSpacedHex,
  uint8ArrayToBinaryString,
  hexToBinaryString
} from '../../src/renderer/src/features/diagnostics/hex'

describe('diagnostics/hex 纯工具', () => {
  it('stripWhitespace 去除空格与换行', () => {
    expect(stripWhitespace('A B\nC\r\nD\tE')).toBe('ABCDE')
    expect(stripWhitespace('')).toBe('')
  })

  it('isValidHex 校验合法性（允许成对字节）', () => {
    expect(isValidHex('01 0a FF')).toBe(true)
    expect(isValidHex('010A')).toBe(true)
    expect(isValidHex('abc')).toBe(false) // 奇数长度
    expect(isValidHex('0G')).toBe(false) // 非法字符
    expect(isValidHex('')).toBe(true)
  })

  it('hexToUint8Array 正确解析并自动去空白', () => {
    const bytes = hexToUint8Array('01 0a FF 10')
    expect(Array.from(bytes)).toEqual([0x01, 0x0a, 0xff, 0x10])
  })

  it('uint8ArrayToHex 输出大写 HEX', () => {
    expect(uint8ArrayToHex(new Uint8Array([0x0a, 0x00, 0xff, 0x10]))).toBe('0A00FF10')
    expect(uint8ArrayToHex(new Uint8Array([0x0a, 0xff]), false)).toBe('0aff')
  })

  it('hex 与 bytes 往返一致', () => {
    const hex = 'DEADBEEF0011'
    const bytes = hexToUint8Array(hex)
    expect(uint8ArrayToHex(bytes)).toBe(hex.toUpperCase())
  })

  it('hexToSpacedHex 按字节空格分隔且保留大小写', () => {
    expect(hexToSpacedHex('0a 0B FF')).toBe('0a 0B FF')
    expect(hexToSpacedHex('0a0Bff')).toBe('0a 0B ff')
    expect(hexToSpacedHex('')).toBe('')
  })

  it('uint8ArrayToBinaryString 每字节映射一个 char code', () => {
    const binary = uint8ArrayToBinaryString(new Uint8Array([0x41, 0x42, 0x00, 0xff]))
    expect(binary.length).toBe(4)
    expect(binary.charCodeAt(0)).toBe(0x41)
    expect(binary.charCodeAt(3)).toBe(0xff)
  })

  it('hexToBinaryString 与 hex → bytes → binary 等价', () => {
    const hex = '0102FF'
    expect(hexToBinaryString(hex)).toBe(uint8ArrayToBinaryString(hexToUint8Array(hex)))
    expect(hexToBinaryString('414243')).toBe('ABC')
  })
})
