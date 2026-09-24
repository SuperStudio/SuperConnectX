import type { FtpConnection, FtpPermission } from './base'

const DEFAULT_PERMISSIONS: FtpPermission[] = ['get', 'put', 'delete', 'rename']

export const FtpStrategy = {
  createDefault(): FtpConnection {
    return {
      name: '',
      connectionType: 'ftp',
      ftpMode: 'server',
      host: '',
      port: 21,
      username: '',
      password: '',
      ftpDirectory: '',
      ftpPermissions: [...DEFAULT_PERMISSIONS]
    }
  },

  fromRaw(raw: any): FtpConnection {
    return {
      id: raw.id,
      name: raw.name || '',
      connectionType: 'ftp',
      ftpMode: raw.ftpMode || 'server',
      host: raw.host || '',
      port: raw.port || 21,
      username: raw.username || '',
      password: raw.password || '',
      ftpDirectory: raw.ftpDirectory || '',
      ftpPermissions: raw.ftpPermissions || [...DEFAULT_PERMISSIONS]
    }
  }
}
