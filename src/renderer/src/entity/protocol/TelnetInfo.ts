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
    if (conn.id) {
      return {
        id: conn.id,
        name: conn.name || '',
        connectionType: conn.connectionType || 'telnet',
        host: conn.host || '',
        port: conn.port || 23,
        username: conn.username || '',
        password: conn.password || ''
      }
    } else {
      return {
        name: conn.name || '',
        connectionType: conn.connectionType || 'telnet',
        host: conn.host || '',
        port: conn.port || 23,
        username: conn.username || '',
        password: conn.password || ''
      }
    }
  }
}
