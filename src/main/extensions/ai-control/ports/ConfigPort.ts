import type {
  ConfigDomainSchema,
  ConfigPatchResult,
  ConfigSnapshot
} from '../../../services/types/RuntimeTypes'

export interface ConfigPort {
  describe(domain?: string): ConfigDomainSchema[]
  get(domain: string, targetId?: string | null): ConfigSnapshot
  patch(request: {
    domain: string
    targetId?: string | null
    patch: Record<string, unknown>
    expectedRevision?: number
  }): Promise<ConfigPatchResult>
  recordExternalChange(
    domain: string,
    targetId: string | null,
    details: Record<string, unknown>
  ): ConfigSnapshot
}
