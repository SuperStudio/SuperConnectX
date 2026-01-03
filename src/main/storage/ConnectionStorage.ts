import logger from '../ipc/IpcAppLogger'
import BaseStorage from './BaseStorage'

const STORAGE_NAME = 'connections'

export default class ConnectionStorage extends BaseStorage {
  constructor() {
    super(STORAGE_NAME, {
      connections: []
    })
  }

  add(conn: any) {
    const connections = this.getAll() as any[]
    const newId = connections.length ? Math.max(...connections.map((c) => c.id)) + 1 : 1
    const newConn = { id: newId, ...conn }
    connections.push(newConn)
    this.saveAll(connections as never[])

    logger.info(`add connection ${conn.host}:${conn.port}`)
    logger.debug(JSON.stringify(newConn))
    return newConn
  }

  update(conn: any) {
    const connections = this.getAll() as any[]
    let con = connections.filter((item) => item.id === conn.id)
    if (!con.length) {
      console.log(`con not found`)
      return
    }

    con[0].name = conn.name
    con[0].port = conn.port
    con[0].type = conn.type
    con[0].host = conn.host
    con[0].username = conn.username
    // 新增：添加FTP所需的密码字段
    if (conn.type === 'ftp') {
      con[0].password = conn.password
    }

    this.saveAll(connections as never[])
    logger.info(`update connection ${conn.host}:${conn.port}`)
    logger.debug(JSON.stringify(con[0]))
    return con
  }

  delete(id: number) {
    const connections = this.getAll() as any[]
    const newConnections = connections.filter((c) => c.id !== id)
    const deleteItem = connections.filter((c) => c.id === id)
    this.saveAll(newConnections as never[])

    logger.info(`delete connection ${deleteItem?.[0].host}:${deleteItem?.[0].port}`)
    logger.debug(JSON.stringify(deleteItem))
    return newConnections
  }
}
