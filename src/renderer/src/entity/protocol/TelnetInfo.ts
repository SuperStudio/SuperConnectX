export default class TelnetInfo {
  static build(): object {
    return {
      name: '',
      connectionType: 'telnet',
      host: '',
      port: 23,
      username: '',
      password: ''
    }
  }

  static buildWithValue(conn): object {
    if (conn.id) {
      return {
        id: conn.id,
        name: conn.name,
        connectionType: conn.connectionType,
        host: conn.host,
        port: conn.port,
        username: conn.username,
        password: conn.password
      }
    } else {
      return {
        name: conn.name,
        connectionType: conn.connectionType,
        host: conn.host,
        port: conn.port,
        username: conn.username,
        password: conn.password
      }
    }
  }
}
