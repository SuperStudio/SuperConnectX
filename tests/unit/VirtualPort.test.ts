import { describe, it, expect } from 'vitest'
import VirtualPort from '../../src/main/entity/VirtualPort'

describe('VirtualPort', () => {
  describe('构造', () => {
    it('无参构造属性为默认值', () => {
      const port = new VirtualPort()
      expect(port.ID).toBe('')
      expect(port.Name).toBe('')
      expect(port.EmuBR).toBe(false)
      expect(port.EmuOverrun).toBe(false)
      expect(port.EmuNoise).toBe(0)
      expect(port.AddRTTO).toBe(0)
      expect(port.AddRITO).toBe(0)
      expect(port.PlugInMode).toBe(false)
      expect(port.ExclusiveMode).toBe(false)
      expect(port.HiddenMode).toBe(false)
    })

    it('带 name 参数构造', () => {
      const port = new VirtualPort('COM2')
      expect(port.Name).toBe('COM2')
      expect(port.ID).toBe('')
    })
  })

  describe('isProperPortName', () => {
    it('合法 COM 端口名返回 true', () => {
      expect(VirtualPort.isProperPortName('COM1')).toBe(true)
      expect(VirtualPort.isProperPortName('COM5')).toBe(true)
      expect(VirtualPort.isProperPortName('COM55')).toBe(true)
      expect(VirtualPort.isProperPortName('com3')).toBe(true)
      expect(VirtualPort.isProperPortName(' COM4 ')).toBe(false) // 有空格不 trim
    })

    it('非法端口名返回 false', () => {
      expect(VirtualPort.isProperPortName('')).toBe(false)
      expect(VirtualPort.isProperPortName('COM0')).toBe(false)
      expect(VirtualPort.isProperPortName('COM')).toBe(false)
      expect(VirtualPort.isProperPortName('LPT1')).toBe(false)
      expect(VirtualPort.isProperPortName('ABC')).toBe(false)
      expect(VirtualPort.isProperPortName('COM-1')).toBe(false)
    })
  })

  describe('isProperNumber', () => {
    it('合法数值返回 true', () => {
      const port = new VirtualPort()
      port.AddRITO = 100
      port.AddRTTO = 200
      port.EmuNoise = 0.5
      expect(VirtualPort.isProperNumber(port)).toBe(true)
    })

    it('零值边界返回 true', () => {
      const port = new VirtualPort()
      expect(VirtualPort.isProperNumber(port)).toBe(true)
    })

    it('AddRITO 为负数返回 false', () => {
      const port = new VirtualPort()
      port.AddRITO = -1
      expect(VirtualPort.isProperNumber(port)).toBe(false)
    })

    it('AddRTTO 为负数返回 false', () => {
      const port = new VirtualPort()
      port.AddRTTO = -1
      expect(VirtualPort.isProperNumber(port)).toBe(false)
    })

    it('EmuNoise 为负数返回 false', () => {
      const port = new VirtualPort()
      port.EmuNoise = -0.1
      expect(VirtualPort.isProperNumber(port)).toBe(false)
    })

    it('EmuNoise 超过最大值返回 false', () => {
      const port = new VirtualPort()
      port.EmuNoise = VirtualPort.MAX_EMU_NOISE + 0.1
      expect(VirtualPort.isProperNumber(port)).toBe(false)
    })

    it('AddRITO 超过最大值返回 false', () => {
      const port = new VirtualPort()
      port.AddRITO = VirtualPort.MAX_MS_VALUE + 1
      expect(VirtualPort.isProperNumber(port)).toBe(false)
    })

    it('null 返回 false', () => {
      expect(VirtualPort.isProperNumber(null as unknown as VirtualPort)).toBe(false)
    })
  })

  describe('toUpdateString', () => {
    it('生成完整的 update 字符串', () => {
      const port = new VirtualPort('COM2')
      port.ID = 'CNCA0'
      port.EmuBR = true
      port.EmuOverrun = true

      const result = port.toUpdateString()
      expect(result).toContain('PortName=COM2')
      expect(result).toContain('EmuBR=yes')
      expect(result).toContain('EmuOverrun=yes')
      expect(result).not.toContain('ID=')
    })

    it('boolean false 映射为 no', () => {
      const port = new VirtualPort('COM2')
      port.EmuBR = false

      const result = port.toUpdateString()
      expect(result).toContain('EmuBR=no')
    })

    it('数字值正确转换', () => {
      const port = new VirtualPort('COM2')
      port.EmuNoise = 0.5
      port.AddRTTO = 100

      const result = port.toUpdateString()
      expect(result).toContain('EmuNoise=0.5')
      expect(result).toContain('AddRTTO=100')
    })

    it('不包含 ID 字段', () => {
      const port = new VirtualPort('COM2')
      port.ID = 'CNCA0'

      const result = port.toUpdateString()
      expect(result).not.toContain('CNCA0')
    })
  })

  describe('equals', () => {
    it('相同属性返回 true', () => {
      const a = new VirtualPort('COM2')
      a.ID = 'CNCA0'
      a.EmuBR = true
      const b = new VirtualPort('COM2')
      b.ID = 'CNCA0'
      b.EmuBR = true
      expect(a.equals(b)).toBe(true)
    })

    it('不同属性返回 false', () => {
      const a = new VirtualPort('COM2')
      const b = new VirtualPort('COM4')
      expect(a.equals(b)).toBe(false)
    })

    it('null 返回 false', () => {
      const port = new VirtualPort()
      expect(port.equals(null)).toBe(false)
    })

    it('默认值相等', () => {
      const a = new VirtualPort()
      const b = new VirtualPort()
      expect(a.equals(b)).toBe(true)
    })
  })

  describe('常量', () => {
    it('MAX_EMU_NOISE', () => {
      expect(VirtualPort.MAX_EMU_NOISE).toBe(0.99999999)
    })

    it('MAX_MS_VALUE', () => {
      expect(VirtualPort.MAX_MS_VALUE).toBe(2147483647)
    })
  })
})
