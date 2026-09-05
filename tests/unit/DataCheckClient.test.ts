import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  migrateCrcMethod,
  loadCrcPlugins,
  requestCrcHex,
  requestCrcBinary
} from '../../src/renderer/src/features/diagnostics/dataCheck'

describe('diagnostics/dataCheck 客户端封装', () => {
  const originalWindow = globalThis.window

  beforeEach(() => {
    const checkData = vi.fn()
    const getPlugins = vi.fn()
    ;(globalThis as any).window = {
      dataCheckApi: { checkData, getPlugins }
    }
    vi.stubGlobal('window', (globalThis as any).window)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalWindow !== undefined) {
      ;(globalThis as any).window = originalWindow
    } else {
      delete (globalThis as any).window
    }
  })

  it('migrateCrcMethod 将旧方法名映射到新算法名', () => {
    expect(migrateCrcMethod('crc8')).toBe('CRC-8/ITU')
    expect(migrateCrcMethod('crc16modbus')).toBe('CRC-16/MODBUS')
    expect(migrateCrcMethod('crc16ccitt')).toBe('CRC-16/CCITT-FALSE')
    expect(migrateCrcMethod('crc32')).toBe('CRC-32')
    expect(migrateCrcMethod('CRC-16/MODBUS')).toBe('CRC-16/MODBUS')
    expect(migrateCrcMethod('未知')).toBe('未知')
  })

  it('loadCrcPlugins 返回插件列表', async () => {
    const plugins = [{ name: 'CRC-16/MODBUS', type: 'crc' }]
    ;(globalThis as any).window.dataCheckApi.getPlugins.mockResolvedValue(plugins)
    await expect(loadCrcPlugins()).resolves.toEqual(plugins)
    expect((globalThis as any).window.dataCheckApi.getPlugins).toHaveBeenCalledOnce()
  })

  it('requestCrcHex 透传方法名与输入并返回 hexResult', async () => {
    ;(globalThis as any).window.dataCheckApi.checkData.mockResolvedValue({
      plugin: 'CRC-16/MODBUS',
      hexResult: 'A1B2'
    })
    await expect(requestCrcHex('CRC-16/MODBUS', '0102')).resolves.toBe('A1B2')
    expect((globalThis as any).window.dataCheckApi.checkData).toHaveBeenCalledWith(
      'CRC-16/MODBUS',
      '0102'
    )
  })

  it('requestCrcHex 校验失败时返回 null 而不抛出', async () => {
    ;(globalThis as any).window.dataCheckApi.checkData.mockRejectedValue(new Error('boom'))
    await expect(requestCrcHex('CRC-16/MODBUS', 'ZZ')).resolves.toBeNull()
  })

  it('requestCrcBinary 将 hexResult 转为可拼接的二进制字符串', async () => {
    ;(globalThis as any).window.dataCheckApi.checkData.mockResolvedValue({
      plugin: 'CRC-16/MODBUS',
      hexResult: '4142'
    })
    const binary = await requestCrcBinary('CRC-16/MODBUS', '0102')
    expect(binary).toBe('AB')
  })

  it('requestCrcBinary 校验失败时返回 null', async () => {
    ;(globalThis as any).window.dataCheckApi.checkData.mockRejectedValue(new Error('boom'))
    await expect(requestCrcBinary('CRC-16/MODBUS', '0102')).resolves.toBeNull()
  })
})
