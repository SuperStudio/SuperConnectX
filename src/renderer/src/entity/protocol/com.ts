import type { ComConnection } from './base'

export const ComStrategy = {
  createDefault(): ComConnection {
    return {
      name: '',
      connectionType: 'com',
      comName: '',
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      encoding: 'utf8',
      readTimeout: 0,
      writeTimeout: 0,
      flowControl: 'none',
      rts: false,
      dtr: false,
      host: '',
      port: 0,
      username: '',
      password: ''
    }
  },

  fromRaw(raw: any): ComConnection {
    return {
      id: raw.id,
      name: raw.name || '',
      connectionType: 'com',
      comName: raw.comName || '',
      baudRate: raw.baudRate || 9600,
      dataBits: raw.dataBits || 8,
      stopBits: raw.stopBits || 1,
      parity: raw.parity || 'none',
      encoding: raw.encoding || 'utf8',
      readTimeout: raw.readTimeout || 0,
      writeTimeout: raw.writeTimeout || 0,
      flowControl: raw.flowControl || 'none',
      rts: raw.rts || false,
      dtr: raw.dtr || false,
      host: raw.host || '',
      port: raw.port || 0,
      username: raw.username || '',
      password: raw.password || ''
    }
  }
}
