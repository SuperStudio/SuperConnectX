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
      return ports.map((port) => ({
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
