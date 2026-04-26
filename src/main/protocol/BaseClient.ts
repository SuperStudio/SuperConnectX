import ConnectionInfo from './ConnectionInfo'

export default class BaseClient {
  async start(_info: ConnectionInfo, _onData: any, _onClose: any): Promise<object> {
    return { success: false, message: 'Not implemented' }
  }

  async send(_connId: string, _command: string, _onComplete: any): Promise<object> {
    return { success: false, message: 'Not implemented' }
  }

  async disconnect(_connId: string): Promise<object> {
    return { success: false, message: 'Not implemented' }
  }

  async updateConfig(_connId: string, _config: any): Promise<object> {
    return { success: false, message: 'Not implemented' }
  }
}
