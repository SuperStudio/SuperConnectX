import { describe, expect, it } from 'vitest'
import SessionLeaseService from '../../src/main/extensions/ai-control/application/SessionLeaseService'
import { createSessionHandlers } from '../../src/main/extensions/ai-control/application/handlers/SessionHandlers'

describe('SessionLeaseService', () => {
  it('allows one principal and rejects another', () => {
    const service = new SessionLeaseService()
    const lease = service.acquireWrite('s1', 'p1')
    expect(lease).toMatchObject({ principalId: 'p1', sessionId: 's1' })
    expect(lease.writeLeaseId).toHaveLength(43)
    expect(() => service.acquireWrite('s1', 'p2')).toThrow('active AI write lease')
    expect(service.releaseWrite('s1', 'p2').released).toBe(false)
    expect(service.releaseWrite('s1', 'p1').released).toBe(true)
  })

  it('continues one logical workflow across MCP principals with the opaque lease id', () => {
    const service = new SessionLeaseService()
    const original = service.acquireWrite('s1', 'transport-a')
    const resumed = service.acquireWrite('s1', 'transport-b', original.writeLeaseId)

    expect(resumed).toMatchObject({
      sessionId: 's1',
      principalId: 'transport-b',
      writeLeaseId: original.writeLeaseId
    })
    expect(service.releaseWrite('s1', 'transport-a').released).toBe(false)
    expect(service.releaseWrite('s1', 'transport-b').released).toBe(true)
  })

  it('rejects an invalid lease id and permits token-based release after reconnect', () => {
    const service = new SessionLeaseService()
    const lease = service.acquireWrite('s1', 'transport-a')
    expect(() => service.acquireWrite('s1', 'transport-b', 'x'.repeat(43))).toThrow(
      'active AI write lease'
    )
    expect(service.releaseWrite('s1', 'transport-b', lease.writeLeaseId).released).toBe(true)
  })

  it('releases idle leases', () => {
    const service = new SessionLeaseService(10)
    service.acquireWrite('s1', 'p1')
    service.releaseExpired(Date.now() + 20)
    expect(service.getLease('s1')).toBeUndefined()
  })

  it('does not create a write lease for a missing runtime session', async () => {
    const leases = new SessionLeaseService()
    const acquire = createSessionHandlers({
      sessions: { get: () => undefined } as never,
      settings: {} as never,
      events: {} as never,
      serial: {} as never,
      leases,
      scheduler: {} as never,
      canCloseUserOpenedConnection: () => false
    }).find((definition) => definition.name === 'session_acquire_write')!

    await expect(
      acquire.handler(
        { sessionId: 'missing' },
        {
          principalId: 'principal',
          clientName: 'test',
          signal: new AbortController().signal
        }
      )
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' })
    expect(leases.getLease('missing')).toBeUndefined()
  })
})
