import type { RuntimeEventBatch, RuntimeEventFilter } from '../../../services/types/RuntimeTypes'

export interface EventPort {
  read(
    afterSequence: number,
    limit: number,
    filter?: RuntimeEventFilter,
    maxBytes?: number
  ): RuntimeEventBatch
  wait(
    afterSequence: number,
    filter: RuntimeEventFilter | undefined,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<RuntimeEventBatch>
  latestSequence(): number
}
