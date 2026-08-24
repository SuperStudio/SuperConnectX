import IpcConnector from '../../../../ipc/IpcConnector'
import ConfigService from '../../../../services/ConfigService'
import type { OperationSource } from '../../../../services/types/RuntimeTypes'
import type { SendEventMetadata } from '../../../../services/ConnectionService'
import type { SessionSnapshot } from '../../../../services/types/RuntimeTypes'
import type { SessionPort } from '../../ports/SessionPort'
import type {
  SessionCommandSettings,
  SessionCommandSettingsPort
} from '../../ports/SessionCommandSettingsPort'

export default class SuperConnectXSessionAdapter
  implements SessionPort, SessionCommandSettingsPort
{
  constructor(
    private readonly connector: IpcConnector,
    private readonly config: ConfigService
  ) {}

  list(): SessionSnapshot[] {
    return this.connector.getConnectionService().listSessions()
  }

  get(sessionId: string): SessionSnapshot | undefined {
    return this.connector.getConnectionService().getSession(sessionId)
  }

  startSaved(
    connectionId: number,
    sessionId: string,
    extraFields?: Record<string, unknown>
  ): Promise<object> {
    return this.connector.startConnectionByIdForAi(connectionId, sessionId, extraFields)
  }

  startPort(
    portPath: string,
    sessionId: string,
    extraFields?: Record<string, unknown>
  ): Promise<object> {
    return this.connector.startPortSessionForAi(portPath, sessionId, extraFields)
  }

  stop(sessionId: string, source: OperationSource = 'ai'): Promise<object> {
    return source === 'ai'
      ? this.connector.stopConnectionForAi(sessionId)
      : this.connector.getConnectionService().stop(sessionId, source)
  }

  send(
    sessionId: string,
    command: string,
    source: OperationSource,
    metadata?: SendEventMetadata
  ): Promise<object> {
    return this.connector
      .getConnectionService()
      .send(sessionId, command, source, undefined, metadata)
  }

  getEffectiveSettings(sessionId: string): SessionCommandSettings {
    const service = this.connector.getConnectionService()
    const runtime = service.getCommandSettings(sessionId)
    if (runtime) return runtime
    const session = service.getSession(sessionId)
    const desired = session?.desiredConfig || {}
    if (
      ['autoNewline', 'hexMode', 'crcEnabled', 'crcMethod'].some(
        (key) => desired[key] !== undefined
      )
    ) {
      return this.normalize(desired)
    }
    const portPath = session?.comName
    const persisted = portPath ? this.config.get('com-settings', portPath).value || {} : {}
    return this.normalize(persisted)
  }

  private normalize(value: Record<string, unknown>): SessionCommandSettings {
    return {
      autoNewline: value.autoNewline !== false,
      hexMode: value.hexMode === true,
      crcEnabled: value.crcEnabled !== false,
      crcMethod: typeof value.crcMethod === 'string' ? value.crcMethod : 'CRC-16/MODBUS'
    }
  }
}
