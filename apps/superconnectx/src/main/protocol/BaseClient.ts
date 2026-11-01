import ConnectionInfo from './ConnectionInfo'

/** 发送选项 */
export interface SendOptions {
  /**
   * 原样发送：true 时不追加换行等结束符。
   * 终端模式下 xterm 会把用户按下的每个字节（含 Ctrl+C 的 \x03）原样交给 widgets，
   * 此时若再补一个 \n 会让 ^C 变成 "^C + 回车"，语义被破坏。
   */
  raw?: boolean
}

// Logger 接口（兼容 winston logger 和 console）
export interface ILogger {
  debug: (message: string, meta?: any) => void
  info: (message: string, meta?: any) => void
  warn: (message: string, meta?: any) => void
  error: (message: string, meta?: any) => void
}

export default class BaseClient {
  protected logger: ILogger

  constructor(logger?: ILogger) {
    this.logger = logger || BaseClient.getDefaultLogger()
  }

  /**
   * 延迟加载默认 logger（避免在 Worker 线程中引入 Electron 依赖）
   */
  private static getDefaultLogger(): ILogger {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('../ipc/IpcAppLogger').default
    } catch {
      // Worker 环境中 fallback 到 console
      return console
    }
  }

  async start(_info: ConnectionInfo, _onData: any, _onClose: any, _onLog?: any): Promise<object> {
    this.logger.warn('BaseClient.start not implemented - subclass should override')
    return { success: false, message: 'Not implemented' }
  }

  async send(_connId: string, _command: string, _onComplete: any, _options?: SendOptions): Promise<object> {
    this.logger.warn('BaseClient.send not implemented - subclass should override')
    return { success: false, message: 'Not implemented' }
  }

  /**
   * 同步终端窗口尺寸到远端 PTY（行数/列数）。
   * 仅交互式 shell 类协议（SSH / Telnet）需要实现；串口等非终端协议保持默认空实现即可。
   */
  async setWindowSize(_connId: string, _rows: number, _cols: number): Promise<object> {
    return { success: true, message: 'Window size not supported' }
  }

  async disconnect(_connId: string): Promise<object> {
    this.logger.warn('BaseClient.disconnect not implemented - subclass should override')
    return { success: false, message: 'Not implemented' }
  }

  async updateConfig(_connId: string, _config: any): Promise<object> {
    this.logger.warn('BaseClient.updateConfig not implemented - subclass should override')
    return { success: false, message: 'Not implemented' }
  }

  setReceiveHex(_connId: string, _receiveHex: boolean): void {
    // 可选实现
  }
}
