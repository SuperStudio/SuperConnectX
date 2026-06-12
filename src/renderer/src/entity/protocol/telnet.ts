import type { TelnetConnection } from './base'

export const TelnetStrategy = {
  createDefault(): TelnetConnection {
    return {
      name: '',
      connectionType: 'telnet',
      host: '',
      port: 23,
      username: '',
      password: ''
    }
  },

  fromRaw(raw: any): TelnetConnection {
    return {
      id: raw.id,
      name: raw.name || '',
      connectionType: 'telnet',
      host: raw.host || '',
      port: raw.port || 23,
      username: raw.username || '',
      password: raw.password || ''
    }
  }
}
