import { randomUUID } from 'node:crypto'

export const MCP_RESULT_SOURCE = 'superconnectx'

export type McpErrorCode =
  | 'PORT_NOT_FOUND'
  | 'PORT_BUSY'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_WRITE_LOCKED'
  | 'PERMISSION_DENIED'
  | 'TEMPLATE_NOT_FOUND'
  | 'TEMPLATE_INVALID'
  | 'COMMAND_TIMEOUT'
  | 'READ_LIMIT_EXCEEDED'
  | 'LOG_NOT_FOUND'
  | 'CONFIRMATION_REQUIRED'
  | 'UNSUPPORTED'
  | 'INTERNAL_ERROR'

export interface McpErrorBody {
  code: McpErrorCode | string
  message: string
  retryable: boolean
}

export interface McpResultMeta {
  requestId: string
  truncated: boolean
  source: typeof MCP_RESULT_SOURCE
}

export function createRequestId(): string {
  return randomUUID()
}

export function detectTruncated(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const value = data as Record<string, unknown>
  if (typeof value.truncated === 'boolean') return value.truncated
  if (value.error && typeof value.error === 'object') return false
  return false
}

export function mcpToolResult(
  data: unknown,
  options: { requestId?: string; truncated?: boolean; isError?: boolean } = {}
) {
  const requestId = options.requestId ?? createRequestId()
  const truncated = options.truncated ?? detectTruncated(data)
  const meta: McpResultMeta = {
    requestId,
    truncated,
    source: MCP_RESULT_SOURCE
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ data, meta }) }],
    ...(options.isError ? { isError: true } : {})
  }
}

export function mcpErrorResult(
  error: McpErrorBody,
  options: { requestId?: string } = {}
) {
  return mcpToolResult({ error }, { requestId: options.requestId, isError: true })
}

export function mapErrorToMcp(error: unknown): McpErrorBody {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  if (/permission denied/.test(lower)) {
    return { code: 'PERMISSION_DENIED', message, retryable: false }
  }
  if (/write lease/.test(lower)) {
    return { code: 'SESSION_WRITE_LOCKED', message, retryable: true }
  }
  if (/session not found/.test(lower)) {
    return { code: 'SESSION_NOT_FOUND', message, retryable: false }
  }
  if (/already in use|port busy|session already exists/.test(lower)) {
    return { code: 'PORT_BUSY', message, retryable: false }
  }
  if (/serial port is not available|port.*not/.test(lower)) {
    return { code: 'PORT_NOT_FOUND', message, retryable: false }
  }
  if (/template not found/.test(lower)) {
    return { code: 'TEMPLATE_NOT_FOUND', message, retryable: false }
  }
  if (/invalid template|template version/.test(lower)) {
    return { code: 'TEMPLATE_INVALID', message, retryable: false }
  }
  if (/log file not found|missing/.test(lower) && /log/.test(lower)) {
    return { code: 'LOG_NOT_FOUND', message, retryable: false }
  }
  if (/timeout/.test(lower)) {
    return { code: 'COMMAND_TIMEOUT', message, retryable: true }
  }
  if (/confirm/.test(lower)) {
    return { code: 'CONFIRMATION_REQUIRED', message, retryable: false }
  }
  if (/not available|unsupported|only available/.test(lower)) {
    return { code: 'UNSUPPORTED', message, retryable: false }
  }
  if (/cannot stop user-owned/.test(lower)) {
    return { code: 'PERMISSION_DENIED', message, retryable: false }
  }
  return { code: 'INTERNAL_ERROR', message, retryable: false }
}

export function summarizeCommand(command?: string): string | undefined {
  if (!command) return undefined
  const redacted = command
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,]+/gi, '$1[REDACTED]')
    .replace(/((?:password|passwd|token|secret|api[_-]?key)\s*[:=]\s*)[^\s,]+/gi, '$1[REDACTED]')
  return redacted.length > 80 ? `${redacted.slice(0, 77)}...` : redacted
}
