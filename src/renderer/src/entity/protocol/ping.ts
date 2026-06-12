import type { PingConnection } from './base'

export const PingStrategy = {
  createDefault(): PingConnection {
    return {
      name: '',
      connectionType: 'ping',
      host: ''
    }
  },

  fromRaw(raw: any): PingConnection {
    return {
      id: raw.id,
      name: raw.name || '',
      connectionType: 'ping',
      host: raw.host || ''
    }
  }
}
