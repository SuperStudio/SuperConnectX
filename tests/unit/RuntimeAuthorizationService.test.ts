import { describe, expect, it } from 'vitest'
import RuntimeAuthorizationService from '../../src/main/extensions/ai-control/application/RuntimeAuthorizationService'

describe('RuntimeAuthorizationService', () => {
  it('always starts in read-only mode', () => {
    expect(new RuntimeAuthorizationService().getPermission()).toBe('read-only')
  })

  it('allows a manual runtime elevation and clears it on reset', () => {
    const authorization = new RuntimeAuthorizationService()
    authorization.setPermission('full-control')
    expect(authorization.getPermission()).toBe('full-control')
    authorization.reset()
    expect(authorization.getPermission()).toBe('read-only')
  })
})
