import { AI_ERROR_CODES, type AiErrorCode } from './AiErrorCodes'

export class AiOperationError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AiOperationError'
  }
}

export function asAiOperationError(error: unknown): AiOperationError {
  if (error instanceof AiOperationError) return error
  return new AiOperationError(
    AI_ERROR_CODES.INTERNAL_ERROR,
    'Internal operation failed. Check the local application log for details.'
  )
}
