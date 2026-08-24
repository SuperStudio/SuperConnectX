import type { SerialPortCatalog, SerialPortDescriptor } from '../../ports/SerialPortCatalog'

export default class SuperConnectXSerialAdapter implements SerialPortCatalog {
  constructor(private readonly listPorts: () => Promise<unknown[]>) {}

  async list(): Promise<SerialPortDescriptor[]> {
    const items = await this.listPorts()
    return items.flatMap((item) => {
      if (typeof item === 'string') return [{ path: this.normalize(item) }]
      if (!item || typeof item !== 'object') return []
      const value = item as Record<string, unknown>
      if (typeof value.path !== 'string' || !value.path.trim()) return []
      return [
        {
          path: this.normalize(value.path),
          displayName: typeof value.friendlyName === 'string' ? value.friendlyName : undefined,
          manufacturer: typeof value.manufacturer === 'string' ? value.manufacturer : undefined,
          serialNumber: typeof value.serialNumber === 'string' ? value.serialNumber : undefined,
          vendorId: typeof value.vendorId === 'string' ? value.vendorId : undefined,
          productId: typeof value.productId === 'string' ? value.productId : undefined
        }
      ]
    })
  }

  normalize(portPath: string): string {
    const value = portPath.trim()
    if (process.platform === 'win32') {
      const withoutPrefix = value.replace(/^\\\\\.\\/, '')
      if (/^\d+$/.test(withoutPrefix)) return `COM${withoutPrefix}`
      if (/^com\d+$/i.test(withoutPrefix)) return withoutPrefix.toUpperCase()
      return withoutPrefix
    }
    return value
  }

  equals(left: string, right: string): boolean {
    const a = this.normalize(left)
    const b = this.normalize(right)
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
  }
}
