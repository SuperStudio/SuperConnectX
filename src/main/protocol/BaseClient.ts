import ConnectionInfo from './ConnectionInfo'

export default class BaseClient {
  async start(info: ConnectionInfo, onData: any, onClose: any): Promise<object> {}

  async send(connId: string, command: string, onComplete: any): Promise<object> {}

  async disconnect(connId: string): Promise<object> {}
}
