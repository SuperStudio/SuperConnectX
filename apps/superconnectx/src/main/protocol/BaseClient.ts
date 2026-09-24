import ConnectionInfo from './ConnectionInfo'

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

  async send(_connId: string, _command: string, _onComplete: any): Promise<object> {
    this.logger.warn('BaseClient.send not implemented - subclass should override')
    return { success: false, message: 'Not implemented' }
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
