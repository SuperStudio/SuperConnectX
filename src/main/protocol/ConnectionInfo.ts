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
}
