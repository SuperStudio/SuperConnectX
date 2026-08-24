import { describe, expect, it, vi } from 'vitest'
import PolicyService from '../../src/main/extensions/ai-control/application/PolicyService'
import RuntimeAuthorizationService from '../../src/main/extensions/ai-control/application/RuntimeAuthorizationService'
import type AiConfigService from '../../src/main/extensions/ai-control/infrastructure/AiConfigService'
import type { AiConfigDocument } from '../../src/shared/extensions/ai-control/AiConfigTypes'

function config(enabled = true): AiConfigService {
  const document: AiConfigDocument = {
    version: 1,
    revision: 1,
    shared: {
      basePort: 32180,
      capabilityGroups: {
        sessionRead: true,
        serialWrite: true,
        sessionManage: false,
        connectionManage: true,
        commandManage: true,
        configManage: true,
        auditRead: true
      },
      allowAiCloseUserConnection: false,
      activity: {
        overlayClickable: true,
        overlayOpacity: 0.9,
        overlayPosition: 'bottom-left',
        overlayDuration: 4,
        logRoot: '',
        logMaxSizeMb: 10,
        logMaxFiles: 5,
        commandContentMode: 'preview'
      }
    },
    instances: { '0': { enabled, alias: '', portOverride: null, token: 'x'.repeat(32) } }
  }
  return {
    get: vi.fn(() => structuredClone(document)),
    getInstance: vi.fn(() => structuredClone(document.instances['0'])),
    refreshIfChanged: vi.fn(async () => undefined)
  } as unknown as AiConfigService
}

describe('PolicyService', () => {
  it('keeps server information visible but hides disabled capability groups', () => {
    const policy = new PolicyService(config(), new RuntimeAuthorizationService())
    expect(policy.isVisible('server_get_info', 'sessionRead', 'read')).toBe(true)
    expect(policy.isVisible('session_stop', 'sessionManage', 'write')).toBe(false)
  })

  it('denies writes in read-only mode and allows them in full-control mode', async () => {
    const authorization = new RuntimeAuthorizationService()
    const policy = new PolicyService(config(), authorization)
    await expect(policy.assert('session_send', 'serialWrite', 'write')).rejects.toMatchObject({
      code: 'AI_READ_ONLY'
    })
    authorization.setPermission('full-control')
    await expect(policy.assert('session_send', 'serialWrite', 'write')).resolves.toBeUndefined()
    authorization.reset()
    await expect(policy.assert('session_send', 'serialWrite', 'write')).rejects.toMatchObject({
      code: 'AI_READ_ONLY'
    })
  })

  it('denies every operation while the instance MCP service is disabled', async () => {
    await expect(
      new PolicyService(config(false), new RuntimeAuthorizationService()).assert(
        'server_get_info',
        'sessionRead',
        'read'
      )
    ).rejects.toMatchObject({ code: 'MCP_DISABLED' })
  })
})
