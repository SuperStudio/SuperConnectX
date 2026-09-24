import type { HttpConnection } from './base'

export const HttpStrategy = {
  createDefault(): HttpConnection {
    return {
      name: '',
      connectionType: 'http',
      host: '',
      port: 80,
      username: '',
      password: ''
    }
  },

  fromRaw(raw: any): HttpConnection {
    return {
      id: raw.id,
      name: raw.name || '',
      connectionType: 'http',
      host: raw.host || '',
      port: raw.port || 80,
      username: raw.username || '',
      password: raw.password || ''
    }
  }
}
