/**
 * useConnectionSidebar - 连接侧边栏纯逻辑测试
 * 测试：串口类型解析、搜索过滤、连接分组
 */
import { describe, it, expect } from 'vitest'

// Extract pure functions from useConnectionSidebar for testing
function parseSerialPortType(port: { path: string; friendlyName?: string; manufacturer?: string; pnpId?: string }): 'virtual' | 'usb' | 'bluetooth' | 'none' {
  const text = [port.path, port.friendlyName, port.manufacturer, port.pnpId]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (text.includes('virtual')) return 'virtual'
  if (text.includes('usb')) return 'usb'
  if (text.includes('蓝牙') || text.includes('ble') ||
      text.includes('bluetooth low energy') || text.includes('bluetooth smart') ||
      text.includes('bluetooth le')) return 'bluetooth'
  return 'none'
}

function filterConnections(connections: any[], keyword: string): any[] {
  if (!keyword) return connections
  const lower = keyword.toLowerCase()
  return connections.filter(
    (item) =>
      item.name?.toLowerCase().includes(lower) ||
      item.connectionType?.toLowerCase().includes(lower) ||
      item.host?.toLowerCase().includes(lower) ||
      String(item.port).includes(lower)
  )
}

function filterSerialPorts(ports: any[], keyword: string): any[] {
  if (!keyword) return ports
  const lower = keyword.toLowerCase()
  return ports.filter((port) => port.path.toLowerCase().includes(lower))
}

function groupConnections(connections: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {}
  connections.forEach((conn) => {
    const type = conn.connectionType || 'other'
    if (!groups[type]) groups[type] = []
    groups[type].push(conn)
  })
  return groups
}

describe('parseSerialPortType', () => {
  it('should return virtual for ports with virtual in name', () => {
    expect(parseSerialPortType({ path: 'COM55', friendlyName: 'Virtual Serial Port' })).toBe('virtual')
  })

  it('should return virtual for com0com ports', () => {
    expect(parseSerialPortType({ path: 'COM55', manufacturer: 'com0com - virtual' })).toBe('virtual')
  })

  it('should return usb for USB serial adapters', () => {
    expect(parseSerialPortType({ path: 'COM3', manufacturer: 'USB Serial Converter' })).toBe('usb')
  })

  it('should return bluetooth for BLE ports', () => {
    expect(parseSerialPortType({ path: 'COM7', pnpId: 'BTHENUM\\{...}', friendlyName: 'Bluetooth Low Energy' })).toBe('bluetooth')
  })

  it('should return bluetooth for Chinese bluetooth label', () => {
    expect(parseSerialPortType({ path: 'COM8', friendlyName: '蓝牙串口' })).toBe('bluetooth')
  })

  it('should return bluetooth for BLE acronym', () => {
    expect(parseSerialPortType({ path: 'COM9', manufacturer: 'BLE Device' })).toBe('bluetooth')
  })

  it('should return none for unknown port types', () => {
    expect(parseSerialPortType({ path: 'COM1' })).toBe('none')
  })

  it('should return none for standard COM ports', () => {
    expect(parseSerialPortType({ path: 'COM1', manufacturer: 'Standard Serial Port' })).toBe('none')
  })

  it('should be case-insensitive', () => {
    expect(parseSerialPortType({ path: 'COM10', manufacturer: 'VIRTUAL COM PORT' })).toBe('virtual')
    expect(parseSerialPortType({ path: 'COM11', friendlyName: 'USB DEVICE' })).toBe('usb')
  })

  it('should prioritize virtual over usb', () => {
    expect(parseSerialPortType({ path: 'COM12', manufacturer: 'USB Virtual Port' })).toBe('virtual')
  })
})

describe('filterConnections', () => {
  const connections = [
    { id: 1, name: 'Router Telnet', connectionType: 'telnet', host: '192.168.1.1', port: 23 },
    { id: 2, name: 'Server SSH', connectionType: 'ssh', host: '10.0.0.1', port: 22 },
    { id: 3, name: 'COM1 Serial', connectionType: 'com', host: '', port: 1 },
    { id: 4, name: 'FTP Server', connectionType: 'ftp', host: 'ftp.example.com', port: 21 },
  ]

  it('should return all connections when keyword is empty', () => {
    expect(filterConnections(connections, '')).toHaveLength(4)
  })

  it('should filter by name', () => {
    const result = filterConnections(connections, 'Router')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Router Telnet')
  })

  it('should filter by connection type', () => {
    const result = filterConnections(connections, 'ssh')
    expect(result).toHaveLength(1)
    expect(result[0].connectionType).toBe('ssh')
  })

  it('should filter by host', () => {
    const result = filterConnections(connections, '192.168')
    expect(result).toHaveLength(1)
    expect(result[0].host).toBe('192.168.1.1')
  })

  it('should filter by port', () => {
    const result = filterConnections(connections, '22')
    expect(result).toHaveLength(1)
    expect(result[0].port).toBe(22)
  })

  it('should be case-insensitive', () => {
    expect(filterConnections(connections, 'ROUTER')).toHaveLength(1)
    expect(filterConnections(connections, 'ftp server')).toHaveLength(1)
  })

  it('should return empty array for no match', () => {
    expect(filterConnections(connections, 'nonexistent')).toHaveLength(0)
  })
})

describe('filterSerialPorts', () => {
  const ports = [
    { path: 'COM1', manufacturer: 'USB' },
    { path: 'COM2', manufacturer: 'USB' },
    { path: 'COM55', manufacturer: 'Virtual' },
  ]

  it('should return all ports when keyword is empty', () => {
    expect(filterSerialPorts(ports, '')).toHaveLength(3)
  })

  it('should filter by path', () => {
    const result = filterSerialPorts(ports, 'COM1')
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('COM1')
  })

  it('should be case-insensitive', () => {
    expect(filterSerialPorts(ports, 'com55')).toHaveLength(1)
  })

  it('should return empty for no match', () => {
    expect(filterSerialPorts(ports, 'COM99')).toHaveLength(0)
  })
})

describe('groupConnections', () => {
  const connections = [
    { id: 1, name: 'R1', connectionType: 'telnet' },
    { id: 2, name: 'R2', connectionType: 'telnet' },
    { id: 3, name: 'S1', connectionType: 'ssh' },
    { id: 4, name: 'C1', connectionType: 'com' },
    { id: 5, name: 'F1', connectionType: 'ftp' },
    { id: 6, name: 'Unknown', connectionType: '' },
  ]

  it('should group connections by type', () => {
    const groups = groupConnections(connections)
    expect(groups['telnet']).toHaveLength(2)
    expect(groups['ssh']).toHaveLength(1)
    expect(groups['com']).toHaveLength(1)
    expect(groups['ftp']).toHaveLength(1)
    expect(groups['other']).toHaveLength(1)
  })

  it('should group empty connectionType as other', () => {
    const groups = groupConnections([{ id: 1, name: 'X', connectionType: '' }])
    expect(groups['other']).toBeDefined()
    expect(groups['other']).toHaveLength(1)
  })

  it('should return empty object for empty connections', () => {
    expect(groupConnections([])).toEqual({})
  })

  it('should handle missing connectionType field', () => {
    const groups = groupConnections([{ id: 1, name: 'NoType' }])
    expect(groups['other']).toBeDefined()
  })
})
