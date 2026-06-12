import type { SshConnection } from './base'

export const SshStrategy = {
  createDefault(): SshConnection {
    return {
      name: '',
      connectionType: 'ssh',
      host: '',
      port: 22,
      username: '',
      password: ''
    }
  },

  fromRaw(raw: any): SshConnection {
    return {
      id: raw.id,
      name: raw.name || '',
      connectionType: 'ssh',
      host: raw.host || '',
      port: raw.port || 22,
      username: raw.username || '',
      password: raw.password || ''
    }
  }
}
