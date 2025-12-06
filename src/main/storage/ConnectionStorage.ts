import Store from 'electron-store' // v3 版本在这里可以正常访问 app 模块

export default class ConnectionStorage {
  // 初始化存储
  connectionStore = new Store({
    name: 'connections',
    cwd: 'super-ssh',
    defaults: {
      connections: []
    }
  })
  constructor() {}

  getConnections() {
    return this.connectionStore.get('connections')
  }

  addConnection(conn: any) {
    const connections = this.connectionStore.get('connections') as any[]
    const newId = connections.length ? Math.max(...connections.map((c) => c.id)) + 1 : 1
    const newConn = { id: newId, ...conn }
    connections.push(newConn)
    this.connectionStore.set('connections', connections as never[])
    return newConn
  }

  updateConnection(conn: any) {
    const connections = this.connectionStore.get('connections') as any[]
    let con = connections.filter((item) => item.id === conn.id)
    if (!con) {
      console.log(`con not found`)
      return
    }

    con[0].name = conn.name
    con[0].port = conn.port
    con[0].type = conn.type
    con[0].host = conn.host
    con[0].username = conn.username
    this.connectionStore.set('connections', connections as never[])
    return con
  }

  deleteConnection(id: number) {
    const connections = this.connectionStore.get('connections') as any[]
    const newConnections = connections.filter((c) => c.id !== id)
    this.connectionStore.set('connections', newConnections as never[])
    return newConnections
  }
}
