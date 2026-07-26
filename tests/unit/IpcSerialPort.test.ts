import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock serialport
vi.mock('serialport', () => ({
  SerialPort: {
    list: vi.fn().mockResolvedValue([
      {
        path: '/dev/ttyUSB0',
        manufacturer: 'Test Mfr',
        serialNumber: 'SN123',
        pnpId: 'PNP001',
        locationId: 'LOC1',
        friendlyName: 'Test Serial Port',
        vendorId: 'VID1',
        productId: 'PID1'
      },
      {
        path: '/dev/ttyS0',
        manufacturer: undefined,
        serialNumber: undefined,
        pnpId: undefined,
        locationId: undefined,
        friendlyName: undefined,
        vendorId: undefined,
        productId: undefined
      },
      {
        path: '/dev/ttyprintk',
        manufacturer: undefined,
        serialNumber: undefined,
        pnpId: undefined,
        locationId: undefined,
        friendlyName: 'Linux kernel console port',
        vendorId: undefined,
        productId: undefined
      },
      {
        path: '/dev/ttyVirtual0',
        manufacturer: undefined,
        serialNumber: undefined,
        pnpId: undefined,
        locationId: undefined,
        friendlyName: 'Virtual serial port',
        vendorId: undefined,
        productId: undefined
      },
      {
        path: 'COM1',
        manufacturer: 'Windows Mfr',
        serialNumber: 'W123',
        pnpId: undefined,
        locationId: undefined,
        friendlyName: 'Windows COM',
        vendorId: undefined,
        productId: undefined
      },
      {
        path: 'COM99',
        manufacturer: undefined,
        serialNumber: undefined,
        pnpId: undefined,
        locationId: undefined,
        friendlyName: 'Virtual COM Port',
        vendorId: undefined,
        productId: undefined
      },
      {
        path: '/dev/cu.Bluetooth-Incoming-Port',
        manufacturer: undefined,
        serialNumber: undefined,
        pnpId: undefined,
        locationId: undefined,
        friendlyName: 'Bluetooth Incoming Port',
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
    const mod = await import('../../src/main/ipc/IpcSerialPort')
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

      // The platform-specific filter keeps physical devices and removes virtual ports.
      expect(ports.length).toBeGreaterThanOrEqual(1)
      // ttyUSB0 should always be present (USB device)
      expect(ports[0].path).toBe('/dev/ttyUSB0')
      expect(ports[0].manufacturer).toBe('Test Mfr')
    })

    it('should filter Linux virtual ports without device info', async () => {
      const { SerialPort } = await import('serialport')
      const mockPorts =
        process.platform === 'win32'
          ? [
              { path: 'COM1', manufacturer: 'USB', serialNumber: 'SN1', pnpId: undefined },
              { path: 'COM99', manufacturer: 'Virtual COM Port', serialNumber: undefined, pnpId: undefined }
            ]
          : [
              { path: '/dev/ttyS0', manufacturer: undefined, serialNumber: undefined, pnpId: undefined },
              { path: '/dev/ttyS1', manufacturer: undefined, serialNumber: undefined, pnpId: undefined },
              { path: '/dev/ttyUSB0', manufacturer: 'USB', serialNumber: 'SN1', pnpId: undefined }
            ]
      ;(SerialPort.list as any).mockResolvedValueOnce(mockPorts)

      const instance = IpcSerialPort.getInstance()
      const ports = await instance.listSerialPorts()

      // Only ttyUSB0 should pass (ttyS without device info is filtered)
      if (process.platform === 'linux') {
        expect(ports).toHaveLength(1)
        expect(ports[0].path).toBe('/dev/ttyUSB0')
      } else if (process.platform === 'win32') {
        expect(ports).toHaveLength(1)
        expect(ports[0].path).toBe('COM1')
      } else {
        expect(ports).toHaveLength(3)
      }
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
