export interface SerialPortDescriptor {
  path: string
  displayName?: string
  manufacturer?: string
  serialNumber?: string
  vendorId?: string
  productId?: string
}

export interface SerialPortCatalog {
  list(): Promise<SerialPortDescriptor[]>
  normalize(path: string): string
  equals(left: string, right: string): boolean
}
