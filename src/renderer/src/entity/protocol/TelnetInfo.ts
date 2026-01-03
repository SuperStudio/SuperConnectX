export default class TelnetInfo {
  static build(): object {
    return {
      name: '',
      type: 'telnet',
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
        type: conn.type,
        host: conn.host,
        port: conn.port,
        username: conn.username,
        password: conn.password
      }
    } else {
      return {
        name: conn.name,
        type: conn.type,
        host: conn.host,
        port: conn.port,
        username: conn.username,
        password: conn.password
      }
    }
  }
}
