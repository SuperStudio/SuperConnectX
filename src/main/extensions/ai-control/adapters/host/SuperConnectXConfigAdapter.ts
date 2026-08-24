import ConfigService from '../../../../services/ConfigService'
import type {
  ConfigDomainSchema,
  ConfigPatchResult,
  ConfigSnapshot
} from '../../../../services/types/RuntimeTypes'
import type { ConfigPort } from '../../ports/ConfigPort'

export default class SuperConnectXConfigAdapter implements ConfigPort {
  constructor(private readonly config: ConfigService) {}

  describe(domain?: string): ConfigDomainSchema[] {
    return this.config.describe(domain)
  }

  get(domain: string, targetId?: string | null): ConfigSnapshot {
    return this.config.get(domain, targetId)
  }

  patch(request: {
    domain: string
    targetId?: string | null
    patch: Record<string, unknown>
    expectedRevision?: number
  }): Promise<ConfigPatchResult> {
    return this.config.patch({ ...request, source: 'ai' })
  }

  recordExternalChange(
    domain: string,
    targetId: string | null,
    details: Record<string, unknown>
  ): ConfigSnapshot {
    return this.config.recordExternalChange(domain, targetId, details, 'ai')
  }
}
