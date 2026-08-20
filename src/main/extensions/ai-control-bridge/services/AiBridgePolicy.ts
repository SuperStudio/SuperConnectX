import ConfigService from '../../../services/ConfigService'
import {
  AI_CORE_COM_SETTINGS_FIELDS,
  AI_CORE_CONFIG_DOMAINS,
  AI_CORE_SETTINGS_FIELDS,
  AiBridgeAccessLevel,
  AiBridgePermission,
  getAiBridgeCapabilityState,
  getAiBridgeMethodAccess
} from '../../../../shared/extensions/ai-control-bridge/AiBridgeCapabilities'
import { ConfigDomainSchema, ConfigSnapshot } from '../../../services/types/RuntimeTypes'

export interface AiBridgeControlState {
  enabled: boolean
  permission: AiBridgePermission
  readEnabled: boolean
  writeEnabled: boolean
}

export class AiBridgePolicyError extends Error {
  constructor(
    public readonly code:
      'BRIDGE_DISABLED' | 'AI_READ_ONLY' | 'METHOD_NOT_EXPOSED' | 'CONFIG_SCOPE_DENIED',
    message: string
  ) {
    super(message)
    this.name = 'AiBridgePolicyError'
  }
}

/**
 * AI 请求的统一门控：总开关、只读/完全控制、方法访问级别和核心配置边界
 * 均在这里判定，传输层不复制权限规则。
 */
export default class AiBridgePolicy {
  constructor(private readonly config: ConfigService) {}

  getState(): AiBridgeControlState {
    const settings = this.config.get('settings').value || {}
    const enabled = settings.aiBridgeEnabled === true
    const permission: AiBridgePermission =
      settings.aiBridgePermission === 'full-control' ? 'full-control' : 'read-only'
    return {
      enabled,
      permission,
      readEnabled: enabled,
      writeEnabled: enabled && permission === 'full-control'
    }
  }

  getCapabilities(): Array<ReturnType<typeof getAiBridgeCapabilityState>[number]> {
    const state = this.getState()
    return getAiBridgeCapabilityState(state.enabled, state.permission)
  }

  assertMethod(method: string, params: Record<string, unknown> = {}): AiBridgeAccessLevel {
    const access = getAiBridgeMethodAccess(method, params)
    if (!access) {
      throw new AiBridgePolicyError(
        'METHOD_NOT_EXPOSED',
        `Method is not exposed by the AI bridge: ${method}`
      )
    }

    const state = this.getState()
    if (!state.enabled) {
      throw new AiBridgePolicyError(
        'BRIDGE_DISABLED',
        'AI bridge is disabled in SuperConnectX settings'
      )
    }
    if (access === 'write' && !state.writeEnabled) {
      throw new AiBridgePolicyError(
        'AI_READ_ONLY',
        'AI bridge permission is read-only; control operation denied'
      )
    }
    return access
  }

  assertConfigDomain(domain: string, patch?: Record<string, unknown>): void {
    if (!(AI_CORE_CONFIG_DOMAINS as readonly string[]).includes(domain)) {
      throw new AiBridgePolicyError(
        'CONFIG_SCOPE_DENIED',
        `Configuration domain is outside the AI core boundary: ${domain}`
      )
    }
    if (!patch) return

    for (const field of Object.keys(patch)) {
      if (!this.isCoreConfigField(domain, field)) {
        throw new AiBridgePolicyError(
          'CONFIG_SCOPE_DENIED',
          `Configuration field is outside the AI core boundary: ${domain}.${field}`
        )
      }
    }
  }

  filterConfigSchema(schema: ConfigDomainSchema): ConfigDomainSchema {
    if (!(AI_CORE_CONFIG_DOMAINS as readonly string[]).includes(schema.domain)) {
      throw new AiBridgePolicyError(
        'CONFIG_SCOPE_DENIED',
        `Configuration domain is outside the AI core boundary: ${schema.domain}`
      )
    }
    return {
      ...schema,
      fields: schema.fields.filter((field) => this.isCoreConfigField(schema.domain, field.path))
    }
  }

  filterConfigSnapshot(snapshot: ConfigSnapshot): ConfigSnapshot {
    this.assertConfigDomain(snapshot.domain)
    if (!snapshot.value) return { ...snapshot, value: null }
    const allowed =
      snapshot.domain === 'settings'
        ? (AI_CORE_SETTINGS_FIELDS as readonly string[])
        : (AI_CORE_COM_SETTINGS_FIELDS as readonly string[])
    const value = Object.fromEntries(
      Object.entries(snapshot.value).filter(([key]) => allowed.includes(key))
    )
    return { ...snapshot, value }
  }

  private isCoreConfigField(domain: string, field: string): boolean {
    if (domain === 'settings') return (AI_CORE_SETTINGS_FIELDS as readonly string[]).includes(field)
    if (domain === 'com-settings')
      return (AI_CORE_COM_SETTINGS_FIELDS as readonly string[]).includes(field)
    return false
  }
}
