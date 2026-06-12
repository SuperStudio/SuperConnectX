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

  // 确保所有连接都有 id，修复历史数据缺失 id 的问题
  private ensureIds(connections: any[]): any[] {
    let needSave = false
    const maxId = connections.reduce((max, c) => {
      const id = Number(c.id)
      return id > 0 ? Math.max(max, id) : max
    }, 0)
    let nextId = maxId + 1

    for (const c of connections) {
      if (!c.id || typeof c.id !== 'number') {
        c.id = nextId++
        needSave = true
      }
    }
    if (needSave) {
      this.saveAll(connections as never[])
      logger.info(`[ensureIds] assigned ids to connections, saved`)
    }
    return connections
  }

  getAll(): any[] {
    const data = (this.storageData.get(this.storageName) as any[]) || []
    return this.ensureIds(data)
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
    const newConn = { ...conn, id: newId }
    connections.push(newConn)
    this.saveAll(connections as never[])

    logger.info(`add connection ${conn.host}:${conn.port}`)
    logger.debug(JSON.stringify(newConn))
    return newConn
  }

  update(conn: any) {
    const connections = this.getAll() as any[]
    const numId = Number(conn.id)
    let con = connections.filter((item) => item.id === numId)
    if (!con.length) {
      logger.warn(`update connection not found, id: ${conn.id}`)
      return
    }

    // 检查重复连接（排除自身）- 只有在需要验证的字段都存在时才检查
    if (conn.name !== undefined && conn.host !== undefined && conn.port !== undefined && conn.connectionType !== undefined) {
      if (this.isDuplicateConnection(conn, connections, conn.id)) {
        const error = new DuplicateConnectionError(
          `已存在相同的连接：${conn.connectionType} - ${conn.name} (${conn.host}:${conn.port})`
        )
        logger.warn(error.message)
        throw error
      }
    }

    // 只更新传入的非 undefined 字段，保留原有的其他字段
    if (conn.name !== undefined) {
      con[0].name = conn.name
    }
    if (conn.port !== undefined) {
      con[0].port = conn.port
    }
    if (conn.connectionType !== undefined) {
      con[0].connectionType = conn.connectionType
    }
    if (conn.host !== undefined) {
      con[0].host = conn.host
    }
    if (conn.username !== undefined) {
      con[0].username = conn.username
    }
    if (conn.connectionType === 'ftp') {
      con[0].password = conn.password
      if (conn.ftpMode !== undefined) {
        con[0].ftpMode = conn.ftpMode
      }
      if (conn.ftpDirectory !== undefined) {
        con[0].ftpDirectory = conn.ftpDirectory
      }
      if (conn.ftpPermissions !== undefined) {
        con[0].ftpPermissions = conn.ftpPermissions
      }
    }
    if (conn.fontSize !== undefined) {
      con[0].fontSize = conn.fontSize
    }
    if (conn.fontFamily !== undefined) {
      con[0].fontFamily = conn.fontFamily
    }

    this.saveAll(connections as never[])
    logger.info(`update connection ${conn.host}:${conn.port}`)
    return con
  }

  delete(id: number) {
    const connections = this.getAll() as any[]
    const numId = Number(id)
    const newConnections = connections.filter((c) => c.id !== numId)
    const deleteItem = connections.filter((c) => c.id === numId)
    this.saveAll(newConnections as never[])

    const deleted = deleteItem[0]
    if (deleted) {
      logger.info(`delete connection ${deleted.host}:${deleted.port}`)
      logger.debug(JSON.stringify(deleted))
    } else {
      logger.warn(`delete connection not found, id: ${numId}`)
    }
    return newConnections
  }
}
