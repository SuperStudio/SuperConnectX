import {
  ConfigApplyResult,
  ConfigDomainSchema,
  ConfigPatchRequest,
  ConfigPatchResult,
  ConfigSnapshot,
  OperationSource
} from './types/RuntimeTypes'
import RuntimeEventHub from './RuntimeEventHub'

export interface ConfigPatchContext extends ConfigPatchRequest {
  current: Record<string, unknown> | null
}

export interface ConfigDomainAdapter {
  domain: string
  schema: ConfigDomainSchema
  get(targetId?: string | null): Record<string, unknown> | null
  patch(targetId: string | null, patch: Record<string, unknown>): Record<string, unknown>
}

export class ConfigServiceError extends Error {
  constructor(
    public readonly code:
      | 'CONFIG_DOMAIN_NOT_FOUND'
      | 'CONFIG_TARGET_REQUIRED'
      | 'CONFIG_REVISION_CONFLICT'
      | 'CONFIG_INVALID_PATCH',
    message: string,
    public readonly snapshot?: ConfigSnapshot
  ) {
    super(message)
    this.name = 'ConfigServiceError'
  }
}

type ApplyHandler = (
  context: ConfigPatchContext
) => Promise<ConfigApplyResult | void> | ConfigApplyResult | void

const copyValue = <T>(value: T): T => {
  if (value === null || value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * GUI 与扩展共用的配置门面。
 * 领域适配器保留原有持久化格式，本服务统一处理 schema、类型校验、revision 和变更事件。
 */
export default class ConfigService {
  private readonly adapters = new Map<string, ConfigDomainAdapter>()
  private readonly revisions = new Map<string, number>()
  private readonly applyHandlers: ApplyHandler[] = []

  constructor(private readonly eventHub: RuntimeEventHub) {}

  register(adapter: ConfigDomainAdapter): void {
    if (this.adapters.has(adapter.domain))
      throw new Error(`Config domain already registered: ${adapter.domain}`)
    this.adapters.set(adapter.domain, adapter)
  }

  addApplyHandler(handler: ApplyHandler): void {
    this.applyHandlers.push(handler)
  }

  describe(domain?: string): ConfigDomainSchema[] {
    const adapters = domain
      ? ([this.adapters.get(domain)].filter(Boolean) as ConfigDomainAdapter[])
      : Array.from(this.adapters.values())
    if (domain && adapters.length === 0)
      throw new ConfigServiceError('CONFIG_DOMAIN_NOT_FOUND', `Unknown config domain: ${domain}`)
    return adapters.map((adapter) => copyValue(adapter.schema))
  }

  get(domain: string, targetId?: string | null): ConfigSnapshot {
    const adapter = this.requireAdapter(domain)
    const normalizedTarget = targetId ?? null
    if (adapter.schema.targetRequired && !normalizedTarget) {
      throw new ConfigServiceError(
        'CONFIG_TARGET_REQUIRED',
        `Config domain ${domain} requires targetId`
      )
    }
    return {
      domain,
      targetId: normalizedTarget,
      value: copyValue(adapter.get(normalizedTarget)),
      revision: this.getRevision(domain, normalizedTarget)
    }
  }

  async patch(
    request: Omit<ConfigPatchRequest, 'source'> & { source?: OperationSource }
  ): Promise<ConfigPatchResult> {
    const source = request.source || 'ai'
    const adapter = this.requireAdapter(request.domain)
    const targetId = request.targetId ?? null
    if (adapter.schema.targetRequired && !targetId) {
      throw new ConfigServiceError(
        'CONFIG_TARGET_REQUIRED',
        `Config domain ${request.domain} requires targetId`
      )
    }
    if (!request.patch || typeof request.patch !== 'object' || Array.isArray(request.patch)) {
      throw new ConfigServiceError('CONFIG_INVALID_PATCH', 'Config patch must be an object')
    }
    this.validatePatch(adapter.schema.fields, request.patch, source)

    const current = this.get(request.domain, targetId)
    if (request.expectedRevision !== undefined && request.expectedRevision !== current.revision) {
      throw new ConfigServiceError(
        'CONFIG_REVISION_CONFLICT',
        `Config revision conflict: expected ${request.expectedRevision}, current ${current.revision}`,
        current
      )
    }

    const changed = copyValue(request.patch)
    const value = adapter.patch(targetId, changed)
    const revision = current.revision + 1
    this.revisions.set(this.revisionKey(request.domain, targetId), revision)
    const snapshot: ConfigSnapshot = {
      domain: request.domain,
      targetId,
      value: copyValue(value),
      revision
    }

    let effectiveNow = true
    let requiresReconnect = false
    let requiresRestart = false
    for (const handler of this.applyHandlers) {
      const result = await handler({ ...request, source, targetId, current: current.value })
      if (!result) continue
      if (result.effectiveNow !== undefined) effectiveNow = effectiveNow && result.effectiveNow
      requiresReconnect = requiresReconnect || result.requiresReconnect === true
      requiresRestart = requiresRestart || result.requiresRestart === true
    }

    this.eventHub.publish({
      eventType: 'config.changed',
      source,
      payload: {
        domain: request.domain,
        targetId,
        revision,
        changed,
        effectiveNow,
        requiresReconnect,
        requiresRestart
      }
    })

    return {
      success: true,
      snapshot,
      changed,
      effectiveNow,
      requiresReconnect,
      requiresRestart,
      source
    }
  }

  getRevision(domain: string, targetId: string | null = null): number {
    return this.revisions.get(this.revisionKey(domain, targetId)) || 0
  }

  /**
   * 记录无法通过 `patch` 表达的领域操作，例如连接档案和命令目录 CRUD。
   * 原 handler 继续负责校验与持久化，本服务只补充单调递增 revision 和界面刷新事件。
   */
  recordExternalChange(
    domain: string,
    targetId: string | null,
    changed: Record<string, unknown>,
    source: OperationSource = 'ai'
  ): ConfigSnapshot {
    const current = this.get(domain, targetId)
    const revision = current.revision + 1
    this.revisions.set(this.revisionKey(domain, targetId), revision)
    this.eventHub.publish({
      eventType: 'config.changed',
      source,
      payload: {
        domain,
        targetId,
        revision,
        changed,
        effectiveNow: true,
        requiresReconnect: false,
        requiresRestart: false
      }
    })
    return {
      domain,
      targetId,
      value: copyValue(this.get(domain, targetId).value),
      revision
    }
  }

  private requireAdapter(domain: string): ConfigDomainAdapter {
    const adapter = this.adapters.get(domain)
    if (!adapter)
      throw new ConfigServiceError('CONFIG_DOMAIN_NOT_FOUND', `Unknown config domain: ${domain}`)
    return adapter
  }

  private validatePatch(
    fields: ConfigDomainSchema['fields'],
    patch: Record<string, unknown>,
    source: OperationSource
  ): void {
    for (const [path, value] of Object.entries(patch)) {
      const field = fields.find((item) => item.path === path || item.aliases?.includes(path))
      // GUI 保留旧的开放对象保存语义，允许 upstream 新增字段先通过；AI 只能写 registry 已声明字段。
      if (!field && source === 'gui') continue
      if (!field || !field.writable || field.secret) {
        throw new ConfigServiceError('CONFIG_INVALID_PATCH', `Field is not writable: ${path}`)
      }
      const valid =
        field.type === 'string'
          ? typeof value === 'string'
          : field.type === 'number'
            ? typeof value === 'number' &&
              Number.isFinite(value) &&
              (field.min === undefined || value >= field.min) &&
              (field.max === undefined || value <= field.max)
            : field.type === 'boolean'
              ? typeof value === 'boolean'
              : field.type === 'array'
                ? Array.isArray(value)
                : field.type === 'enum'
                  ? (typeof value === 'string' || typeof value === 'number') &&
                    (!field.enum || field.enum.includes(value))
                  : value !== null && typeof value === 'object' && !Array.isArray(value)
      if (!valid)
        throw new ConfigServiceError('CONFIG_INVALID_PATCH', `Invalid value for field: ${path}`)
    }
  }

  private revisionKey(domain: string, targetId: string | null): string {
    return `${domain}:${targetId || '-'}`
  }
}
