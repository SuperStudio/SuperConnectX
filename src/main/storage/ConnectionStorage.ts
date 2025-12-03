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

  deleteConnection(id: number) {
    const connections = this.connectionStore.get('connections') as any[]
    const newConnections = connections.filter((c) => c.id !== id)
    this.connectionStore.set('connections', newConnections as never[])
    return newConnections
  }
}
