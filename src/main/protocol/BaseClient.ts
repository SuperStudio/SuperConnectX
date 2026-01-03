export default class BaseClient {
  async start(host, port, sessionId, onData, onClose): Promise<object> {}

  async send(connId, command, onComplete): Promise<object> {}

  async disconnect(connId): Promise<object> {}
}
