import logger from '../ipc/IpcAppLogger'
import BaseStorage from './BaseStorage'

const STORAGE_NAME = 'connections'

// 自定义错误类
export class DuplicateConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DuplicateConnectionError'
  }
}

export default class ConnectionStorage extends BaseStorage {
  constructor() {
    super(STORAGE_NAME, {
      connections: []
    })
  }

  // 检查是否存在重复连接（协议类型、连接名称、地址、端口都相同）
  private isDuplicateConnection(conn: any, connections: any[], excludeId?: number): boolean {
    return connections.some((existing) => {
      // 排除自身（编辑场景）
      if (excludeId !== undefined && existing.id === excludeId) {
        return false
      }
      return (
        existing.connectionType === conn.connectionType &&
        existing.name === conn.name &&
        existing.host === conn.host &&
        existing.port === conn.port
      )
    })
  }

  add(conn: any) {
    const connections = this.getAll() as any[]

    // 检查重复连接
    if (this.isDuplicateConnection(conn, connections)) {
      const error = new DuplicateConnectionError(
        `已存在相同的连接：${conn.connectionType} - ${conn.name} (${conn.host}:${conn.port})`
      )
      logger.warn(error.message)
      throw error
    }

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

    // 检查重复连接（排除自身）
    if (this.isDuplicateConnection(conn, connections, conn.id)) {
      const error = new DuplicateConnectionError(
        `已存在相同的连接：${conn.connectionType} - ${conn.name} (${conn.host}:${conn.port})`
      )
      logger.warn(error.message)
      throw error
    }

    con[0].name = conn.name
    con[0].port = conn.port
    con[0].connectionType = conn.connectionType
    con[0].host = conn.host
    con[0].username = conn.username
    // 新增：添加FTP所需的密码字段
    if (conn.connectionType === 'ftp') {
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
