import type {
  AiConfigDocument,
  AiPermission
} from '../../../../shared/extensions/ai-control/AiConfigTypes'
import AiConfigService from '../infrastructure/AiConfigService'
import { AiOperationError } from './AiErrors'
import RuntimeAuthorizationService from './RuntimeAuthorizationService'

export type AiCapabilityGroup =
  | 'sessionRead'
  | 'serialWrite'
  | 'sessionManage'
  | 'connectionManage'
  | 'commandManage'
  | 'configManage'
  | 'auditRead'

export default class PolicyService {
  constructor(
    private readonly config: AiConfigService,
    private readonly authorization: RuntimeAuthorizationService
  ) {}

  async refresh(): Promise<void> {
    await this.config.refreshIfChanged()
  }

  getState(): { enabled: boolean; permission: AiPermission; config: AiConfigDocument } {
    const config = this.config.get()
    return {
      enabled: this.config.getInstance().enabled,
      permission: this.authorization.getPermission(),
      config
    }
  }

  isVisible(name: string, group: AiCapabilityGroup, access: 'read' | 'write'): boolean {
    const state = this.getState()
    if (!state.enabled) return false
    if (name === 'server_get_info') return true
    if (!state.config.shared.capabilityGroups[group]) return false
    return access === 'read' || state.permission === 'full-control'
  }

  async assert(name: string, group: AiCapabilityGroup, access: 'read' | 'write'): Promise<void> {
    await this.refresh()
    const state = this.getState()
    if (!state.enabled) throw new AiOperationError('MCP_DISABLED', 'MCP service is disabled')
    if (!state.config.shared.capabilityGroups[group] && name !== 'server_get_info') {
      throw new AiOperationError('CAPABILITY_DISABLED', `Capability group is disabled: ${group}`)
    }
    if (access === 'write' && state.permission !== 'full-control') {
      throw new AiOperationError('AI_READ_ONLY', 'AI permission is read-only')
    }
  }
}
