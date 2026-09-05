import type { UdpConnection } from './base'

export const UdpStrategy = {
  createDefault(): UdpConnection {
    return {
      name: '',
      connectionType: 'udp',
      host: '',
      port: 0
    }
  },

  fromRaw(raw: any): UdpConnection {
    return {
      id: raw.id,
      name: raw.name || '',
      connectionType: 'udp',
      host: raw.host || '',
      port: raw.port || 0
    }
  }
}
