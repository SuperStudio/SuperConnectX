export interface ConnectionFormData {
  id?: number
  name: string
  connectionType: string
  host: string
  port: number
  username: string
  password: string
}

export default class TelnetInfo {
  static build(): ConnectionFormData {
    return {
      name: '',
      connectionType: 'telnet',
      host: '',
      port: 23,
      username: '',
      password: ''
    }
  }

  static buildWithValue(conn: any): ConnectionFormData {
    const baseData = {
      id: conn.id,
      name: conn.name || '',
      connectionType: conn.connectionType || 'telnet',
      host: conn.host || '',
      port: conn.port || 23,
      username: conn.username || '',
      password: conn.password || ''
    }

    // 如果是串口连接，添加串口相关字段
    if (conn.connectionType === 'com') {
      return {
        ...baseData,
        comName: conn.comName,
        baudRate: conn.baudRate,
        dataBits: conn.dataBits,
        stopBits: conn.stopBits,
        parity: conn.parity,
        encoding: conn.encoding,
        readTimeout: conn.readTimeout,
        writeTimeout: conn.writeTimeout,
        flowControl: conn.flowControl,
        rts: conn.rts,
        dtr: conn.dtr
      }
    }

    return baseData
  }
}
