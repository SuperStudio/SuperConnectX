import { ipcMain } from 'electron'
import { SerialPort } from 'serialport'
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
      logger.info(`found ${ports.length} serial ports`)

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

        // Keep Windows ports unless the driver explicitly identifies them as virtual.
        if (platform === 'win32') {
          const description = `${port.friendlyName || ''} ${port.manufacturer || ''}`.toLowerCase()
          return !/(virtual|bluetooth[- ]incoming|com0com|eltima|vspd|vspe)/i.test(description)
        }

        // macOS: exclude Apple's virtual Bluetooth-incoming port.
        if (platform === 'darwin') {
          return !path.endsWith('.Bluetooth-Incoming-Port')
        }

        return false
      })

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

  init(_logger: any, _windows: any): void {
    ipcMain.handle('list-serial-ports', async () => {
      return await this.listSerialPorts()
    })

    logger.info(`init IpcSerialPort done`)
  }
}
