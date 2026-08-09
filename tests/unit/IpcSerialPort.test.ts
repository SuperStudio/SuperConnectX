import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock child_process.execSync so registry queries don't affect test counts
vi.mock('child_process', () => ({
  execSync: vi.fn().mockReturnValue('')
}))

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
        // Windows keeps all COM ports, including software-virtualised ones
        expect(ports).toHaveLength(2)
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

  describe('getWindowsRegistryPorts (via listSerialPorts on win32)', () => {
    it('should supplement ports from registry when execSync returns valid data', async () => {
      // Simulate Windows platform
      const platformStub = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')

      const { SerialPort } = await import('serialport')
      // serialport returns COM1 only
      ;(SerialPort.list as any).mockResolvedValueOnce([
        { path: 'COM1', manufacturer: 'USB', serialNumber: 'SN1' }
      ])

      const { execSync } = await import('child_process')
      // registry returns COM55 and COM56
      ;(execSync as any).mockReturnValueOnce(
        '    \\Device\\com0com10    REG_SZ    COM55\r\n    \\Device\\com0com20    REG_SZ    COM56\r\n'
      )

      const instance = IpcSerialPort.getInstance()
      const ports = await instance.listSerialPorts()

      // COM1 from serialport + COM55, COM56 from registry
      expect(ports).toHaveLength(3)
      expect(ports.map((p: any) => p.path).sort()).toEqual(['COM1', 'COM55', 'COM56'])

      platformStub.mockRestore()
    })

    it('should deduplicate registry ports already in serialport list', async () => {
      const platformStub = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')

      const { SerialPort } = await import('serialport')
      ;(SerialPort.list as any).mockResolvedValueOnce([
        { path: 'COM1', manufacturer: 'USB' },
        { path: 'COM55', manufacturer: 'Virtual' }
      ])

      const { execSync } = await import('child_process')
      // registry returns COM55 (duplicate) and COM56 (new)
      ;(execSync as any).mockReturnValueOnce(
        '    \\Device\\com0com10    REG_SZ    COM55\r\n    \\Device\\com0com20    REG_SZ    COM56\r\n'
      )

      const instance = IpcSerialPort.getInstance()
      const ports = await instance.listSerialPorts()

      // COM1 + COM55 (from serialport) + COM56 (from registry, not duplicate)
      expect(ports).toHaveLength(3)
      expect(ports.map((p: any) => p.path).sort()).toEqual(['COM1', 'COM55', 'COM56'])

      platformStub.mockRestore()
    })

    it('should handle empty registry output', async () => {
      const platformStub = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')

      const { SerialPort } = await import('serialport')
      ;(SerialPort.list as any).mockResolvedValueOnce([
        { path: 'COM1' }
      ])

      const { execSync } = await import('child_process')
      ;(execSync as any).mockReturnValueOnce('')

      const instance = IpcSerialPort.getInstance()
      const ports = await instance.listSerialPorts()

      expect(ports).toHaveLength(1)
      expect(ports[0].path).toBe('COM1')

      platformStub.mockRestore()
    })

    it('should handle execSync throwing error gracefully', async () => {
      const platformStub = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')

      const { SerialPort } = await import('serialport')
      ;(SerialPort.list as any).mockResolvedValueOnce([
        { path: 'COM1' }
      ])

      const { execSync } = await import('child_process')
      ;(execSync as any).mockImplementationOnce(() => {
        throw new Error('registry access denied')
      })

      const instance = IpcSerialPort.getInstance()
      const ports = await instance.listSerialPorts()

      // Should still return serialport ports despite registry error
      expect(ports).toHaveLength(1)
      expect(ports[0].path).toBe('COM1')

      platformStub.mockRestore()
    })

    it('should parse COM ports with various registry line formats', async () => {
      const platformStub = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')

      const { SerialPort } = await import('serialport')
      ;(SerialPort.list as any).mockResolvedValueOnce([])

      const { execSync } = await import('child_process')
      // Mix of different device names and COM port numbers
      ;(execSync as any).mockReturnValueOnce(
        '    \\Device\\VSerial_0    REG_SZ    COM20\r\n' +
        '    \\Device\\BthModem0    REG_SZ    COM7\r\n' +
        '    \\Device\\com0com11    REG_SZ    COM66\r\n'
      )

      const instance = IpcSerialPort.getInstance()
      const ports = await instance.listSerialPorts()

      expect(ports).toHaveLength(3)
      const paths = ports.map((p: any) => p.path).sort()
      expect(paths).toEqual(['COM20', 'COM66', 'COM7'])

      platformStub.mockRestore()
    })

    it('should NOT supplement registry ports on non-Windows platforms', async () => {
      // On Linux, registry logic is skipped entirely
      const platformStub = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')

      const { SerialPort } = await import('serialport')
      ;(SerialPort.list as any).mockResolvedValueOnce([
        { path: '/dev/ttyUSB0', manufacturer: 'USB', serialNumber: 'SN1' },
        { path: '/dev/ttyS0' },
        { path: '/dev/ttyprintk' }
      ])

      const { execSync } = await import('child_process')
      // Even if execSync would return something, it should not be called on Linux
      const execSyncSpy = vi.spyOn({ execSync }, 'execSync')

      const instance = IpcSerialPort.getInstance()
      const ports = await instance.listSerialPorts()

      // Only ttyUSB0 passes Linux filter
      expect(ports).toHaveLength(1)
      expect(ports[0].path).toBe('/dev/ttyUSB0')
      expect(execSyncSpy).not.toHaveBeenCalled()

      platformStub.mockRestore()
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
