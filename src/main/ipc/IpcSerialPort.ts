import { ipcMain } from 'electron'
import { SerialPort } from 'serialport'
import { execSync } from 'child_process'
import logger from './IpcAppLogger'

export default class IpcSerialPort {
  private static sInstance: IpcSerialPort

  constructor() {}

  static getInstance(): IpcSerialPort {
    if (IpcSerialPort.sInstance == null) {
      IpcSerialPort.sInstance = new IpcSerialPort()
    }
    return IpcSerialPort.sInstance
  }

  async listSerialPorts(): Promise<object[]> {
    try {
      const ports = await SerialPort.list()
      logger.info(`serialport.list() returned ${ports.length} ports`)

      const platform = process.platform

      const filtered = ports.filter((port) => {
        const path = port.path || ''

        // Linux: keep physical serial adapters and explicitly supported GPIO/Bluetooth devices.
        if (platform === 'linux') {
          if (path.startsWith('/dev/ttyS')) {
            return !!(port.manufacturer || port.serialNumber || port.pnpId)
          }
          if (
            path.startsWith('/dev/ttyUSB') ||
            path.startsWith('/dev/ttyACM') ||
            path.startsWith('/dev/ttyAMA') ||
            path.startsWith('/dev/rfcomm')
          ) {
            return true
          }
          return false
        }

        // Windows: keep all COM ports. Software-virtualised serial ports (com0com,
        // Eltima, VSPD, etc.) are also valid ports users may want to connect to.
        if (platform === 'win32') {
          return true
        }

        // macOS: exclude Apple's virtual Bluetooth-incoming port.
        if (platform === 'darwin') {
          return !path.endsWith('.Bluetooth-Incoming-Port')
        }

        return false
      })

      // Windows: supplement with ports from registry that serialport may miss.
      // Some virtual serial port drivers (e.g. com0com) only register in
      // HKLM\HARDWARE\DEVICEMAP\SERIALCOMM but have no SetupAPI device node,
      // so SerialPort.list() won't pick them up.
      if (platform === 'win32') {
        const registryPorts = this.getWindowsRegistryPorts()
        const existingPaths = new Set(filtered.map((p) => (p.path || '').toUpperCase()))
        for (const regPort of registryPorts) {
          if (!existingPaths.has(regPort.path.toUpperCase())) {
            filtered.push(regPort)
            existingPaths.add(regPort.path.toUpperCase())
          }
        }
      }

      const uniquePorts = filtered.filter(
        (port, index, allPorts) => allPorts.findIndex((candidate) => candidate.path === port.path) === index
      )

      logger.info(`filtered to ${uniquePorts.length} serial ports`)
      return uniquePorts.map((port) => ({
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber,
        pnpId: port.pnpId,
        locationId: port.locationId,
        friendlyName: port.friendlyName,
        vendorId: port.vendorId,
        productId: port.productId
      }))
    } catch (error) {
      logger.error(`list serial ports failed: ${error}`)
      return []
    }
  }

  /**
   * Windows: read COM port mappings from the registry.
   * Returns ports that serialport's SetupAPI enumeration might miss
   * (e.g. com0com virtual ports that only have a registry entry).
   */
  private getWindowsRegistryPorts(): { path: string }[] {
    try {
      const regOutput = execSync(
        'reg query "HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM" 2>&1',
        { encoding: 'utf-8', timeout: 3000 }
      )
      const ports: { path: string }[] = []
      // Each line looks like: "    \\Device\\com0com10    REG_SZ    COM55"
      const re = /REG_SZ\s+(COM\d+)/gi
      let match: RegExpExecArray | null
      while ((match = re.exec(regOutput)) !== null) {
        ports.push({ path: match[1] })
      }
      logger.info(`registry supplement: found ${ports.length} ports from SERIALCOMM`)
      return ports
    } catch {
      logger.info('registry supplement: failed to read SERIALCOMM')
      return []
    }
  }

  init(_logger: any, _windows: any): void {
    ipcMain.handle('list-serial-ports', async () => {
      return await this.listSerialPorts()
    })

    logger.info(`init IpcSerialPort done`)
  }
}
