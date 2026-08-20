import ConfigService from '../../../services/ConfigService'
import { CoreCatalog } from '../../../services/types/CoreCatalog'
import { InstanceInfo } from '../types/AiBridgeTypes'
import ConnectionService from '../../../services/ConnectionService'
import RuntimeEventHub from '../../../services/RuntimeEventHub'
import AiBridgePolicy from '../services/AiBridgePolicy'
import AiBridgeLogReader from '../services/AiBridgeLogReader'

export interface AiBridgeSessionLifecycle {
  startByConnectionId: (
    connectionId: number,
    sessionId: string,
    extraFields?: Record<string, unknown>
  ) => Promise<object>
  startByPort: (
    portPath: string,
    sessionId: string,
    extraFields?: Record<string, unknown>
  ) => Promise<object>
  stop: (sessionId: string) => Promise<object>
}

export interface BridgeSerialPorts {
  list: () => Promise<unknown[]>
}

/**
 * 协议层访问宿主软件的最小端口集合。
 * Electron、Storage 和具体连接 backend 由主进程注入，使桥梁传输层可独立测试。
 */
export default interface AiBridgeHost {
  instance: InstanceInfo
  connections: ConnectionService
  config: ConfigService
  events: RuntimeEventHub
  access: AiBridgePolicy
  lifecycle: AiBridgeSessionLifecycle
  catalog: CoreCatalog
  serialPorts: BridgeSerialPorts
  logs: AiBridgeLogReader
}
