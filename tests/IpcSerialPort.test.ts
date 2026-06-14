import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock serialport
vi.mock('serialport', () => ({
  SerialPort: {
    list: vi.fn().mockResolvedValue([
      {
        path: 'COM1',
        manufacturer: 'Test Mfr',
        serialNumber: 'SN123',
        pnpId: 'PNP001',
        locationId: 'LOC1',
        friendlyName: 'Test Serial Port',
        vendorId: 'VID1',
        productId: 'PID1'
      },
      {
        path: 'COM2',
        manufacturer: undefined,
        serialNumber: undefined,
        pnpId: undefined,
        locationId: undefined,
        friendlyName: undefined,
        vendorId: undefined,
        productId: undefined
      }
    ])
  }
}))

describe('IpcSerialPort', () => {
  let IpcSerialPort: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../src/main/ipc/IpcSerialPort')
    IpcSerialPort = mod.default
  })

  describe('singleton', () => {
    it('should return same instance', () => {
      const i1 = IpcSerialPort.getInstance()
      const i2 = IpcSerialPort.getInstance()
      expect(i1).toBe(i2)
    })
  })

  describe('listSerialPorts', () => {
    it('should return mapped port list', async () => {
      const instance = IpcSerialPort.getInstance()
      const ports = await instance.listSerialPorts()
      
      expect(ports).toHaveLength(2)
      expect(ports[0]).toEqual({
        path: 'COM1',
        manufacturer: 'Test Mfr',
        serialNumber: 'SN123',
        pnpId: 'PNP001',
        locationId: 'LOC1',
        friendlyName: 'Test Serial Port',
        vendorId: 'VID1',
        productId: 'PID1'
      })
      expect(ports[1].path).toBe('COM2')
    })

    it('should return empty array on error', async () => {
      const { SerialPort } = await import('serialport')
      ;(SerialPort.list as any).mockRejectedValueOnce(new Error('No ports'))

      const instance = IpcSerialPort.getInstance()
      const ports = await instance.listSerialPorts()
      expect(ports).toEqual([])
    })
  })

  describe('init', () => {
    it('should have init method', () => {
      const instance = IpcSerialPort.getInstance()
      expect(typeof instance.init).toBe('function')
    })

    it('init should not throw', () => {
      const instance = IpcSerialPort.getInstance()
      expect(() => instance.init(null, {})).not.toThrow()
    })
  })
})
