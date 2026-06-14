import { describe, it, expect } from 'vitest'
import { getPlugins, checkData } from '../../src/main/utils/DataCheckEngine'

describe('DataCheckEngine', () => {
  describe('getPlugins', () => {
    it('返回非空算法列表', () => {
      const plugins = getPlugins()
      expect(plugins.length).toBeGreaterThan(0)
    })

    it('每个算法都有 name 和 type', () => {
      const plugins = getPlugins()
      for (const p of plugins) {
        expect(p.name).toBeTruthy()
        expect(['crc', 'native']).toContain(p.type)
      }
    })

    it('包含常见的 CRC 算法', () => {
      const plugins = getPlugins()
      const names = plugins.map((p) => p.name)
      expect(names).toContain('CRC-16/MODBUS')
      expect(names).toContain('CRC-32')
      expect(names).toContain('CRC-8/ITU')
    })

    it('包含非 CRC 算法', () => {
      const plugins = getPlugins()
      const names = plugins.map((p) => p.name)
      expect(names).toContain('BCC(异或校验)')
      expect(names).toContain('LRC(纵向冗余校验)')
      expect(names).toContain('累加和校验')
    })
  })

  describe('checkData - CRC 算法', () => {
    it('CRC-16/MODBUS - 已知向量', () => {
      // 输入 "010304" -> [0x01, 0x03, 0x04], 预期 CRC = 0xE5F9 (大端)
      const result = checkData('CRC-16/MODBUS', '010304')
      expect(result.plugin).toBe('CRC-16/MODBUS')
      expect(result.hexResult.length).toBe(4) // 2 字节 hex
    })

    it('CRC-16/MODBUS - 空数据', () => {
      const result = checkData('CRC-16/MODBUS', '')
      expect(result.hexResult).toBeTruthy()
    })

    it('CRC-8/ITU', () => {
      const result = checkData('CRC-8/ITU', '010203')
      expect(result.plugin).toBe('CRC-8/ITU')
      expect(result.hexResult.length).toBe(2) // 1 字节 hex
    })

    it('CRC-32 - 返回 8 位 hex', () => {
      const result = checkData('CRC-32', '1234567890')
      expect(result.hexResult.length).toBe(8) // 4 字节 hex
    })

    it('CRC-32/BZIP2', () => {
      const result = checkData('CRC-32/BZIP2', 'hello')
      expect(result.plugin).toBe('CRC-32/BZIP2')
      expect(result.hexResult).toBeTruthy()
    })

    it('CRC-64/ECMA-182', () => {
      const result = checkData('CRC-64/ECMA-182', 'hello')
      expect(result.plugin).toBe('CRC-64/ECMA-182')
      expect(result.hexResult.length).toBe(16) // 8 字节 hex
    })

    it('CRC-16/MODBUS-LE - 小端序', () => {
      // MODBUS-LE 应该返回小端字节序
      const result = checkData('CRC-16/MODBUS-LE', '010304')
      expect(result.plugin).toBe('CRC-16/MODBUS-LE')
      expect(result.hexResult.length).toBe(4)
    })

    it('多个 CRC-8 变种', () => {
      const data = 'FF'
      const r1 = checkData('CRC-8/AUTOSAR', data)
      const r2 = checkData('CRC-8/BLUETOOTH', data)
      expect(r1.hexResult).toBeTruthy()
      expect(r2.hexResult).toBeTruthy()
      // 不同算法的结果应该不同
      expect(r1.hexResult).not.toBe(r2.hexResult)
    })

    it('CRC-24 变种', () => {
      const result = checkData('CRC-24/OPENPGP', 'hello')
      expect(result.hexResult.length).toBe(6) // 3 字节 hex
    })
  })

  describe('checkData - 非 CRC 算法', () => {
    it('BCC(异或校验)', () => {
      // 0x01 ^ 0x03 ^ 0x04 = 0x06
      const result = checkData('BCC(异或校验)', '010304')
      expect(result.hexResult).toBe('06')
    })

    it('BCC - 全零数据', () => {
      const result = checkData('BCC(异或校验)', '000000')
      expect(result.hexResult).toBe('00')
    })

    it('BCC - 单字节', () => {
      const result = checkData('BCC(异或校验)', 'AB')
      expect(result.hexResult).toBe('AB')
    })

    it('LRC(纵向冗余校验)', () => {
      // LRC = ((sum ^ 0xFF) + 1) & 0xFF
      const result = checkData('LRC(纵向冗余校验)', '010304')
      expect(result.hexResult.length).toBe(2) // 1 字节
    })

    it('累加和校验', () => {
      // 0x01 + 0x03 + 0x04 = 0x08
      const result = checkData('累加和校验', '010304')
      expect(result.hexResult).toBe('08')
    })

    it('累加和校验(最大65535)', () => {
      const result = checkData('累加和校验(最大65535)', '010304')
      expect(result.hexResult.length).toBe(4) // 2 字节
    })

    it('累加和校验( 0x100 - Sum 的差值)', () => {
      const result = checkData('累加和校验( 0x100 - Sum 的差值)', '010304')
      expect(result.hexResult.length).toBe(2) // 1 字节
    })

    it('累加和校验( 0x10000 - Sum 的差值)', () => {
      const result = checkData('累加和校验( 0x10000 - Sum 的差值)', '010304')
      expect(result.hexResult.length).toBe(4) // 2 字节
    })
  })

  describe('checkData - 结果详情', () => {
    it('返回 details 数组', () => {
      const result = checkData('CRC-16/MODBUS', '010304')
      expect(result.details.length).toBeGreaterThanOrEqual(2)
    })

    it('details 包含 HEX 结果', () => {
      const result = checkData('CRC-16/MODBUS', '010304')
      const hexDetail = result.details.find((d) => d.resultName === '校验结果 HEX')
      expect(hexDetail).toBeTruthy()
      expect(hexDetail!.resultType).toBe('hex')
    })

    it('details 包含 HEX2ASCII 结果', () => {
      // BCC of '414243' (ABC) = 0x00, hex2ascii = NUL char
      const result = checkData('BCC(异或校验)', '414243')
      const asciiDetail = result.details.find((d) => d.resultName === '校验结果 HEX2ASCII')
      expect(asciiDetail).toBeTruthy()
    })

    it('details 包含十进制结果', () => {
      const result = checkData('CRC-8/ITU', '010203')
      const decDetail = result.details.find((d) => d.resultName === '校验结果 Dec')
      expect(decDetail).toBeTruthy()
      expect(decDetail!.resultType).toBe('dec')
    })
  })

  describe('checkData - 错误处理', () => {
    it('未知算法抛出异常', () => {
      expect(() => checkData('UNKNOWN-ALGO', '010304')).toThrow('未知算法')
    })

    it('空 hex 数据', () => {
      const result = checkData('BCC(异或校验)', '')
      // 空数据 BCC = 0x00
      expect(result.hexResult).toBeTruthy()
    })

    it('带空格的 hex 数据', () => {
      const result = checkData('BCC(异或校验)', '01 03 04')
      expect(result.hexResult).toBe('06')
    })

    it('奇数长度 hex 自动补零', () => {
      // '1' 会被补成 '01'
      const result = checkData('BCC(异或校验)', '1')
      expect(result.hexResult).toBe('01')
    })
  })

  describe('checkData - CRC 确定性与幂等性', () => {
    it('同一数据多次计算结果相同', () => {
      const data = '010304'
      const r1 = checkData('CRC-16/MODBUS', data)
      const r2 = checkData('CRC-16/MODBUS', data)
      expect(r1.hexResult).toBe(r2.hexResult)
    })

    it('不同数据结果不同', () => {
      const r1 = checkData('CRC-16/MODBUS', '010304')
      const r2 = checkData('CRC-16/MODBUS', '010305')
      expect(r1.hexResult).not.toBe(r2.hexResult)
    })
  })
})
