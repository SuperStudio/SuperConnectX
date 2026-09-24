import type { TcpConnection } from './base'

export const TcpStrategy = {
  createDefault(): TcpConnection {
    return {
      name: '',
      connectionType: 'tcp',
      host: '',
      port: 0
    }
  },

  fromRaw(raw: any): TcpConnection {
    return {
      id: raw.id,
      name: raw.name || '',
      connectionType: 'tcp',
      host: raw.host || '',
      port: raw.port || 0
    }
  }
}
