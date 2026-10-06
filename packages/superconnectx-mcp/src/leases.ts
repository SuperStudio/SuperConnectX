import type { WriteLease } from './types.js'

const DEFAULT_TTL_MS = 30_000
const MAX_TTL_MS = 5 * 60_000

export class WriteLeaseManager {
  private readonly leases = new Map<string, WriteLease>()

  acquire(sessionId: string, ownerId: string, ttlMs = DEFAULT_TTL_MS): WriteLease {
    this.expire()
    const current = this.leases.get(sessionId)
    if (current && current.ownerId !== ownerId) {
      throw new Error(`Write lease is held by another client: ${sessionId}`)
    }
    const lease = {
      sessionId,
      ownerId,
      expiresAt: Date.now() + Math.min(Math.max(ttlMs, 1_000), MAX_TTL_MS)
    }
    this.leases.set(sessionId, lease)
    return { ...lease }
  }

  release(sessionId: string, ownerId: string): void {
    const current = this.leases.get(sessionId)
    if (!current) return
    if (current.ownerId !== ownerId) {
      throw new Error(`Write lease is owned by another client: ${sessionId}`)
    }
    this.leases.delete(sessionId)
  }

  assertOwner(sessionId: string, ownerId: string): void {
    this.expire()
    const current = this.leases.get(sessionId)
    if (!current || current.ownerId !== ownerId) {
      throw new Error(`Write lease required: ${sessionId}`)
    }
  }

  clear(sessionId: string): void {
    this.leases.delete(sessionId)
  }

  private expire(): void {
    const now = Date.now()
    for (const [sessionId, lease] of this.leases) {
      if (lease.expiresAt <= now) this.leases.delete(sessionId)
    }
  }
}
