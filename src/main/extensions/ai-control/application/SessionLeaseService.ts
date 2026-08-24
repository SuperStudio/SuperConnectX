import { randomBytes, timingSafeEqual } from 'crypto'
import { AiOperationError } from './AiErrors'

export interface WriteLease {
  sessionId: string
  principalId: string
  writeLeaseId: string
  acquiredAt: number
  lastWriteAt: number
}

export default class SessionLeaseService {
  private readonly leases = new Map<string, WriteLease>()

  constructor(private readonly idleMs = 5 * 60_000) {}

  acquireWrite(sessionId: string, principalId: string, writeLeaseId?: string): WriteLease {
    this.releaseExpired()
    const current = this.leases.get(sessionId)
    if (current && current.principalId !== principalId) {
      if (!writeLeaseId || !this.matchesLeaseId(current.writeLeaseId, writeLeaseId)) {
        throw new AiOperationError(
          'SESSION_WRITE_LOCKED',
          'The session has an active AI write lease. Reuse its writeLeaseId or wait for release.',
          true,
          {
            sessionId
          }
        )
      }
      // MCP Session 只是传输会话。持有不透明租约凭证的同一工作流可以在
      // 重连或切换 HTTP Session 后接续控制，后续断开只释放最新 principal 的租约。
      current.principalId = principalId
      current.lastWriteAt = Date.now()
      return { ...current }
    }
    if (current) return { ...current }
    const now = Date.now()
    const lease = {
      sessionId,
      principalId,
      writeLeaseId: randomBytes(32).toString('base64url'),
      acquiredAt: now,
      lastWriteAt: now
    }
    this.leases.set(sessionId, lease)
    return { ...lease }
  }

  releaseWrite(
    sessionId: string,
    principalId: string,
    writeLeaseId?: string
  ): { released: boolean } {
    const current = this.leases.get(sessionId)
    if (
      !current ||
      (current.principalId !== principalId &&
        (!writeLeaseId || !this.matchesLeaseId(current.writeLeaseId, writeLeaseId)))
    )
      return { released: false }
    this.leases.delete(sessionId)
    return { released: true }
  }

  assertWriteOwner(sessionId: string, principalId: string): void {
    this.releaseExpired()
    const current = this.leases.get(sessionId)
    if (!current || current.principalId !== principalId) {
      throw new AiOperationError(
        'SESSION_WRITE_LEASE_REQUIRED',
        'A write lease is required',
        true,
        {
          sessionId
        }
      )
    }
  }

  touchWrite(sessionId: string, principalId: string): void {
    this.assertWriteOwner(sessionId, principalId)
    const current = this.leases.get(sessionId)
    if (current) current.lastWriteAt = Date.now()
  }

  releaseSession(sessionId: string): void {
    this.leases.delete(sessionId)
  }

  releaseAll(principalId: string): void {
    for (const [sessionId, lease] of this.leases) {
      if (lease.principalId === principalId) this.leases.delete(sessionId)
    }
  }

  getLease(sessionId: string): WriteLease | undefined {
    this.releaseExpired()
    const lease = this.leases.get(sessionId)
    return lease ? { ...lease } : undefined
  }

  releaseExpired(now = Date.now()): void {
    for (const [sessionId, lease] of this.leases) {
      if (now - lease.lastWriteAt >= this.idleMs) this.leases.delete(sessionId)
    }
  }

  clear(): void {
    this.leases.clear()
  }

  private matchesLeaseId(expected: string, supplied: string): boolean {
    const left = Buffer.from(expected, 'utf8')
    const right = Buffer.from(supplied, 'utf8')
    return left.length === right.length && timingSafeEqual(left, right)
  }
}
