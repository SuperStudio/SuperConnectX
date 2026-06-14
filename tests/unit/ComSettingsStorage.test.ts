import { describe, it, expect, beforeEach } from 'vitest'
import ComSettingsStorage from '../../src/main/storage/ComSettingsStorage'

describe('ComSettingsStorage', () => {
  let storage: ComSettingsStorage

  beforeEach(() => {
    storage = new ComSettingsStorage()
  })

  describe('getBaudRates', () => {
    it('返回默认波特率', () => {
      const rates = storage.getBaudRates()
      expect(rates).toEqual([9600, 19200, 115200, 1500000])
    })
  })

  describe('saveBaudRates', () => {
    it('保存自定义波特率', () => {
      storage.saveBaudRates([4800, 9600, 38400])
      expect(storage.getBaudRates()).toEqual([4800, 9600, 38400])
    })

    it('保存空数组', () => {
      storage.saveBaudRates([])
      expect(storage.getBaudRates()).toEqual([])
    })
  })

  describe('getSettings / saveSettings', () => {
    it('初始返回 null', () => {
      expect(storage.getSettings('COM1')).toBeNull()
    })

    it('保存并读取串口设置', () => {
      const settings = {
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        encoding: 'utf8',
        readTimeout: 0,
        writeTimeout: 0,
        rts: false,
        dtr: false,
        flowControl: 'none' as const,
        remark: 'Test COM',
        fontSize: 14,
        fontFamily: 'Consolas',
        hexDisplayMode: false,
        showTimestamp: true,
        autoNewline: true,
        hexMode: false,
        crcEnabled: false,
        crcMethod: '',
        commandInput: ''
      }
      storage.saveSettings('COM3', settings)
      const saved = storage.getSettings('COM3')
      expect(saved).not.toBeNull()
      expect(saved!.baudRate).toBe(115200)
      expect(saved!.remark).toBe('Test COM')
      expect(saved!.fontSize).toBe(14)
      expect(saved!.flowControl).toBe('none')
    })

    it('多个串口独立存储', () => {
      storage.saveSettings('COM1', {
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        encoding: 'utf8',
        readTimeout: 0,
        writeTimeout: 0
      } as any)
      storage.saveSettings('COM2', {
        baudRate: 115200,
        dataBits: 7,
        stopBits: 2,
        parity: 'even',
        encoding: 'ascii',
        readTimeout: 100,
        writeTimeout: 200
      } as any)
      expect(storage.getSettings('COM1')!.baudRate).toBe(9600)
      expect(storage.getSettings('COM2')!.baudRate).toBe(115200)
      expect(storage.getSettings('COM2')!.parity).toBe('even')
    })

    it('更新已有设置', () => {
      storage.saveSettings('COM1', {
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        encoding: 'utf8',
        readTimeout: 0,
        writeTimeout: 0
      } as any)
      storage.saveSettings('COM1', {
        baudRate: 38400,
        dataBits: 8,
        stopBits: 1,
        parity: 'odd',
        encoding: 'utf8',
        readTimeout: 0,
        writeTimeout: 0
      } as any)
      const saved = storage.getSettings('COM1')
      expect(saved!.baudRate).toBe(38400)
      expect(saved!.parity).toBe('odd')
    })
  })
})
