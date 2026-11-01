export default interface ConnectionInfo {
  host: string
  port: number
  username: string
  password: string
  sessionId: string
  // 串口参数
  comName?: string
  baudRate?: number
  dataBits?: 5 | 6 | 7 | 8
  stopBits?: 1 | 1.5 | 2
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space'
  // 扩展参数
  encoding?: string
  readTimeout?: number
  writeTimeout?: number
  /** 分包超时（ms）：无换行数据停留超过该时长即强制输出，0 表示禁用（仅按换行符/空闲刷新输出） */
  packetTimeout?: number
  // 流控制参数
  flowControl?: 'none' | 'hardware' | 'software'
  rts?: boolean
  dtr?: boolean
  // 数据接收格式
  receiveHex?: boolean
  // FTP 参数
  ftpMode?: 'server' | 'client'
  ftpDirectory?: string
  ftpPermissions?: string[]
  // SSH 参数
  /** 认证方式：password=密码认证(默认)，key=私钥认证 */
  authMethod?: 'password' | 'key'
  /** 私钥文件路径（authMethod='key' 时必填） */
  privateKeyPath?: string
  /** 私钥本身的口令，可为空（针对加密过的私钥） */
  passphrase?: string
}
