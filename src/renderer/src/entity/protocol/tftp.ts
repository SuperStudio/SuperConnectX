import type { TftpConnection } from './base'

export const TftpStrategy = {
  createDefault(): TftpConnection {
    return {
      name: '',
      connectionType: 'tftp',
      host: '',
      port: 69,
      username: '',
      password: ''
    }
  },

  fromRaw(raw: any): TftpConnection {
    return {
      id: raw.id,
      name: raw.name || '',
      connectionType: 'tftp',
      host: raw.host || '',
      port: raw.port || 69,
      username: raw.username || '',
      password: raw.password || ''
    }
  }
}
