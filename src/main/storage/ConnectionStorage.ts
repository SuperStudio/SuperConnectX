import logger from '../ipc/IpcAppLogger'
import BaseStorage from './BaseStorage'
import SafeStorageString, { MASKED_PASSWORD } from '../utils/SafeStorageString'

const STORAGE_NAME = 'connections'

// 自定义错误类
export class DuplicateConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DuplicateConnectionError'
  }
}

const secureStr = SafeStorageString.getInstance()

/**
 * 需要加密密码字段的协议类型列表
 */
const PROTOCOLS_WITH_PASSWORD = ['ftp', 'telnet', 'ssh', 'tftp', 'http', 'com']

/**
 * 判断连接是否需要处理密码字段
 */
function hasPasswordField(conn: any): boolean {
  return PROTOCOLS_WITH_PASSWORD.includes(conn.connectionType) && conn.password !== undefined
}

/**
 * 加密连接对象中的密码字段（浅拷贝后加密）
 */
function encryptConnectionPassword(conn: any): any {
  if (!hasPasswordField(conn)) return conn
  const encrypted = { ...conn }
  if (encrypted.password && !secureStr.isEncrypted(encrypted.password)) {
    encrypted.password = secureStr.encrypt(encrypted.password)
  }
  return encrypted
}

/**
 * 解密连接对象中的密码字段（浅拷贝后解密）
 */
function decryptConnectionPassword(conn: any): any {
  if (!hasPasswordField(conn)) return conn
  const decrypted = { ...conn }
  if (decrypted.password && secureStr.isEncrypted(decrypted.password)) {
    decrypted.password = secureStr.decrypt(decrypted.password)
  }
  return decrypted
}

/**
 * 将连接对象中的密码字段替换为掩码，返回给前端
 * 前端看不到明文密码，只知道"这个连接有密码"
 */
function maskConnectionPassword(conn: any): any {
  if (!hasPasswordField(conn)) return conn
  const masked = { ...conn }
  if (masked.password) {
    masked.password = MASKED_PASSWORD
  }
  return masked
}

export default class ConnectionStorage extends BaseStorage {
  constructor() {
    super(STORAGE_NAME, {
      connections: []
    })
  }

  /**
   * 读取原始存储数据，自动补 ID（历史数据修复）
   * 返回的数组中的密码字段保持存储原样（加密或明文），不解密
   */
  private readRawConnections(): any[] {
    const connections = (this.storageData.get(this.storageName) as any[]) || []
    let needSave = false

    // 确保所有连接都有 id
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
      logger.info(`[readRawConnections] assigned ids, saved`)
    }

    return connections
  }

  /**
   * 获取所有连接列表（密码字段替换为掩码，前端无法看到明文）
   */
  getAll(): any[] {
    const connections = this.readRawConnections()
    // 密码字段替换为掩码，前端永远看不到明文
    return connections.map(maskConnectionPassword)
  }

  /**
   * 根据 id 获取连接并解密密码（仅供后端连接时使用，前端不可调用）
   */
  getByIdWithPassword(id: number): any | null {
    const connections = this.readRawConnections()
    const conn = connections.find((c: any) => c.id === id)
    if (!conn) return null
    return decryptConnectionPassword(conn)
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
    // readRawConnections 自动执行迁移（补 ID、加密历史明文密码），返回的密码已加密
    const connections = this.readRawConnections()

    // 检查重复连接（用解密后的数据比较）
    const decryptedConnections = connections.map(decryptConnectionPassword)
    if (this.isDuplicateConnection(conn, decryptedConnections)) {
      const error = new DuplicateConnectionError(
        `已存在相同的连接：${conn.connectionType} - ${conn.name} (${conn.host}:${conn.port})`
      )
      logger.warn(error.message)
      throw error
    }

    const newId = connections.length ? Math.max(...connections.map((c: any) => c.id)) + 1 : 1
    // 加密密码后存储
    const newConn = encryptConnectionPassword({ ...conn, id: newId })
    connections.push(newConn)
    this.saveAll(connections as never[])

    logger.info(`add connection ${conn.host}:${conn.port}`)
    // 日志脱敏
    const debugConn = { ...newConn }
    if (debugConn.password) debugConn.password = '***'
    logger.debug(JSON.stringify(debugConn))
    // 返回掩码后的数据给前端（前端看不到明文密码）
    return maskConnectionPassword(newConn)
  }

  update(conn: any) {
    // readRawConnections 自动执行迁移，返回的密码已加密
    const connections = this.readRawConnections()
    const numId = Number(conn.id)
    let con = connections.filter((item: any) => item.id === numId)
    if (!con.length) {
      logger.warn(`update connection not found, id: ${conn.id}`)
      return
    }

    // 检查重复连接（排除自身）- 用解密后的数据比较
    const decryptedConnections = connections.map(decryptConnectionPassword)
    if (conn.name !== undefined && conn.host !== undefined && conn.port !== undefined && conn.connectionType !== undefined) {
      if (this.isDuplicateConnection(conn, decryptedConnections, conn.id)) {
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
    // 更新密码时加密存储（适用于所有有密码字段的协议）
    // 如果前端传的是掩码，表示用户未修改密码，保留原加密值
    if (conn.password !== undefined && hasPasswordField(conn)) {
      if (conn.password === MASKED_PASSWORD) {
        // 用户未修改密码，保留原值
      } else {
        con[0].password = secureStr.encrypt(conn.password)
      }
    }
    if (conn.connectionType === 'ftp') {
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
    // 返回掩码后的数据给前端
    return [maskConnectionPassword(con[0])]
  }

  delete(id: number) {
    // readRawConnections 自动执行迁移，返回的密码已加密
    const connections = this.readRawConnections()
    const numId = Number(id)
    const newConnections = connections.filter((c: any) => c.id !== numId)
    const deleteItem = connections.filter((c: any) => c.id === numId)
    this.saveAll(newConnections as never[])

    const deleted = deleteItem[0]
    if (deleted) {
      logger.info(`delete connection ${deleted.host}:${deleted.port}`)
      // 日志脱敏（deleteItem 来自原始存储，密码可能是加密的，直接脱敏即可）
      const debugDeleted = { ...deleted }
      if (debugDeleted.password) debugDeleted.password = '***'
      logger.debug(JSON.stringify(debugDeleted))
    } else {
      logger.warn(`delete connection not found, id: ${numId}`)
    }
    // 返回掩码后的数据给前端
    return newConnections.map(maskConnectionPassword)
  }
}
