import { describe, expect, it, vi } from 'vitest'
import McpWriteLeaseManager from '../../apps/superconnectx/src/main/mcp/McpWriteLeaseManager'

describe('McpWriteLeaseManager', () => {
  it('allows one owner to renew and rejects a competing owner', () => {
    const manager = new McpWriteLeaseManager()
    const lease = manager.acquire('s1', 'client-a', 10_000)
    expect(lease.ownerId).toBe('client-a')
    expect(() => manager.acquire('s1', 'client-b')).toThrow('another client')
    expect(() => manager.assertOwner('s1', 'client-a')).not.toThrow()
  })

  it('expires leases and enforces owner on release', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_000).mockReturnValue(40_000)
    const manager = new McpWriteLeaseManager()
    manager.acquire('s1', 'client-a', 1_000)
    expect(() => manager.assertOwner('s1', 'client-a')).toThrow('required')
    vi.restoreAllMocks()
  })
})
