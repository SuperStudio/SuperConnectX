export default class TelnetInfo {
  static build() {
    return {
      name: '',
      type: 'telnet',
      host: '',
      port: 23,
      username: ''
    }
  }

  static buildWithValue(conn) {
    if (conn.id) {
      return {
        id: conn.id,
        name: conn.name,
        type: conn.type,
        host: conn.host,
        port: conn.port,
        username: conn.username
      }
    } else {
      return {
        name: conn.name,
        type: conn.type,
        host: conn.host,
        port: conn.port,
        username: conn.username
      }
    }
  }
}
