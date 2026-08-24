import { AiOperationError } from './AiErrors'

type Source = 'gui' | 'ai' | 'system'
interface QueueState {
  tail: Promise<void>
  controllers: Set<AbortController>
  closed: boolean
}

export default class CommandScheduler {
  private readonly queues = new Map<string, QueueState>()
  private disposed = false

  run<T>(
    sessionId: string,
    _source: Source,
    task: (signal: AbortSignal) => Promise<T>,
    externalSignal?: AbortSignal
  ): Promise<T> {
    return this.enqueue(sessionId, task, externalSignal)
  }

  runExclusive<T>(
    sessionId: string,
    _source: Source,
    task: (signal: AbortSignal) => Promise<T>,
    externalSignal?: AbortSignal
  ): Promise<T> {
    return this.enqueue(sessionId, task, externalSignal)
  }

  cancelSession(sessionId: string, reason = 'Session closed'): void {
    const state = this.queues.get(sessionId)
    if (!state) return
    state.closed = true
    for (const controller of state.controllers) controller.abort(reason)
    if (state.controllers.size === 0) this.queues.delete(sessionId)
  }

  dispose(): void {
    this.disposed = true
    for (const sessionId of this.queues.keys()) this.cancelSession(sessionId, 'Scheduler disposed')
  }

  private enqueue<T>(
    sessionId: string,
    task: (signal: AbortSignal) => Promise<T>,
    externalSignal?: AbortSignal
  ): Promise<T> {
    if (this.disposed)
      return Promise.reject(
        new AiOperationError('SCHEDULER_STOPPED', 'Command scheduler is stopped')
      )
    let state = this.queues.get(sessionId)
    if (!state) {
      state = { tail: Promise.resolve(), controllers: new Set(), closed: false }
      this.queues.set(sessionId, state)
    }
    if (state.closed)
      return Promise.reject(new AiOperationError('SESSION_CLOSED', 'Session is closed'))

    const controller = new AbortController()
    const abort = (): void => controller.abort(externalSignal?.reason)
    if (externalSignal?.aborted) abort()
    else externalSignal?.addEventListener('abort', abort, { once: true })

    const execute = async (): Promise<T> => {
      if (state!.closed || controller.signal.aborted) {
        throw new AiOperationError('REQUEST_CANCELLED', 'Command was cancelled', true)
      }
      state!.controllers.add(controller)
      try {
        return await task(controller.signal)
      } finally {
        state!.controllers.delete(controller)
        externalSignal?.removeEventListener('abort', abort)
      }
    }

    const result = state.tail.then(execute, execute)
    state.tail = result.then(
      () => undefined,
      () => undefined
    )
    void state.tail.finally(() => {
      if (state && state.controllers.size === 0 && this.queues.get(sessionId) === state) {
        this.queues.delete(sessionId)
      }
    })
    return result
  }
}
