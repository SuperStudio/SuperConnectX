/**
 * 连接协议 - 基础类型定义
 * 使用判别联合（Discriminated Union）确保类型安全
 */

/** 所有协议类型 */
export type ProtocolType = 'telnet' | 'ssh' | 'ftp' | 'tcp' | 'udp' | 'ping' | 'tftp' | 'http' | 'com'

/** 连接基础字段 */
export interface BaseConnection {
  id?: number
  name: string
  connectionType: string
}

// ===== 各协议独立接口 =====

export interface TelnetConnection extends BaseConnection {
  connectionType: 'telnet'
  host: string
  port: number
  username: string
  password: string
}

export interface SshConnection extends BaseConnection {
  connectionType: 'ssh'
  host: string
  port: number
  username: string
  password: string
}

export interface ComConnection extends BaseConnection {
  connectionType: 'com'
  comName: string
  baudRate: number
  dataBits: number
  stopBits: number
  parity: string
  encoding: string
  readTimeout: number
  writeTimeout: number
  flowControl: string
  rts: boolean
  dtr: boolean
  host: string
  port: number
  username: string
  password: string
}

export interface FtpConnection extends BaseConnection {
  connectionType: 'ftp'
  ftpMode: 'server' | 'client'
  // 客户端字段
  host: string
  port: number
  username: string
  password: string
  // 服务端字段
  ftpDirectory: string
  ftpPermissions: FtpPermission[]
}

export type FtpPermission = 'get' | 'put' | 'delete' | 'rename'

export interface TcpConnection extends BaseConnection {
  connectionType: 'tcp'
  host: string
  port: number
}

export interface UdpConnection extends BaseConnection {
  connectionType: 'udp'
  host: string
  port: number
}

export interface PingConnection extends BaseConnection {
  connectionType: 'ping'
  host: string
}

export interface TftpConnection extends BaseConnection {
  connectionType: 'tftp'
  host: string
  port: number
  username: string
  password: string
}

export interface HttpConnection extends BaseConnection {
  connectionType: 'http'
  host: string
  port: number
  username: string
  password: string
}

// ===== 判别联合类型 =====
export type ConnectionFormData =
  | TelnetConnection
  | SshConnection
  | ComConnection
  | FtpConnection
  | TcpConnection
  | UdpConnection
  | PingConnection
  | TftpConnection
  | HttpConnection

// ===== 类型守卫 =====
export function isTelnetConnection(conn: ConnectionFormData): conn is TelnetConnection {
  return conn.connectionType === 'telnet'
}
export function isSshConnection(conn: ConnectionFormData): conn is SshConnection {
  return conn.connectionType === 'ssh'
}
export function isComConnection(conn: ConnectionFormData): conn is ComConnection {
  return conn.connectionType === 'com'
}
export function isFtpConnection(conn: ConnectionFormData): conn is FtpConnection {
  return conn.connectionType === 'ftp'
}
export function isTcpConnection(conn: ConnectionFormData): conn is TcpConnection {
  return conn.connectionType === 'tcp'
}
export function isUdpConnection(conn: ConnectionFormData): conn is UdpConnection {
  return conn.connectionType === 'udp'
}
export function isPingConnection(conn: ConnectionFormData): conn is PingConnection {
  return conn.connectionType === 'ping'
}
export function isTftpConnection(conn: ConnectionFormData): conn is TftpConnection {
  return conn.connectionType === 'tftp'
}
export function isHttpConnection(conn: ConnectionFormData): conn is HttpConnection {
  return conn.connectionType === 'http'
}
