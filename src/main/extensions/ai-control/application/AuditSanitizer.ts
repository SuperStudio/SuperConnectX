import type { AiCommandContentMode } from '../../../../shared/extensions/ai-control/AiConfigTypes'

const SECRET_KEY =
  /token|password|passwd|authorization|secret|wifi[_-]?key|write[_-]?lease(?:[_-]?(?:id|token))?/i
const SECRET_ASSIGNMENT =
  /(authorization|password|passwd|token|secret|wifi[_-]?key|write[_-]?lease(?:[_-]?(?:id|token))?)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi
const MAX_DEPTH = 8

function sanitizeString(value: string): string {
  return value.replace(SECRET_ASSIGNMENT, '$1=[REDACTED]')
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]'
  if (typeof value === 'string') return sanitizeString(value)
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1))
  if (!value || typeof value !== 'object') return value

  const result: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) continue
    result[key] = sanitizeValue(nested, depth + 1)
  }
  return result
}

export function sanitizeKnownSecrets<T>(value: T): T {
  return sanitizeValue(value, 0) as T
}

export function sanitizeAuditDetails(
  details: Record<string, unknown> | undefined,
  mode: AiCommandContentMode
): Record<string, unknown> | undefined {
  if (!details) return undefined
  const result = sanitizeKnownSecrets(details)
  if (typeof result.command === 'string') {
    if (mode === 'none') delete result.command
    else if (mode === 'preview') result.command = result.command.slice(0, 120)
  }
  return Object.keys(result).length ? result : undefined
}

export function projectCommandText(value: unknown, mode: AiCommandContentMode): string | undefined {
  if (mode === 'none' || typeof value !== 'string') return undefined
  const sanitized = sanitizeString(value)
  return mode === 'preview' ? sanitized.slice(0, 120) : sanitized
}
