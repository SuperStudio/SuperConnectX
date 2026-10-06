import type { DeviceTemplate, LogAnalyzeEvent, LogSearchResult } from './types.js'

export function redactSensitiveText(text: string): string {
  return text
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,]+/gi, '$1[REDACTED]')
    .replace(/((?:password|passwd|token|secret|api[_-]?key)\s*[:=]\s*)[^\s,]+/gi, '$1[REDACTED]')
}

export function searchLogLines(
  sessionId: string,
  lines: string[],
  query: string,
  options: { truncated?: boolean; maxMatches?: number } = {}
): LogSearchResult {
  if (!query || query.length > 512) throw new Error('Search query must be 1-512 characters')
  const maxMatches = Math.min(Math.max(options.maxMatches ?? 200, 1), 2_000)
  const matches = lines
    .flatMap((text, index) => (text.includes(query) ? [{ lineNumber: index + 1, text }] : []))
    .slice(0, maxMatches)
  return {
    sessionId,
    query,
    matches,
    truncated: Boolean(options.truncated) || matches.length >= maxMatches
  }
}

export function analyzeLogLines(
  sessionId: string,
  templateId: string,
  lines: string[],
  template: DeviceTemplate,
  truncated = false
): { sessionId: string; templateId: string; events: LogAnalyzeEvent[]; truncated: boolean } {
  const events = template.logEvents.flatMap((event) => {
    let expression: RegExp
    try {
      expression = new RegExp(event.pattern)
    } catch {
      return []
    }
    return lines.flatMap((text, index) =>
      expression.test(text)
        ? [{ eventId: event.id, level: event.level, summary: event.summary, lineNumber: index + 1, text }]
        : []
    )
  })
  return { sessionId, templateId, events, truncated }
}

export function summarizeLogLines(sessionId: string, lines: string[], truncated = false) {
  const counts = { info: 0, warning: 0, error: 0 }
  for (const line of lines) {
    if (/\b(error|fatal|exception|failed)\b/i.test(line)) counts.error++
    else if (/\b(warn|warning|timeout|retry)\b/i.test(line)) counts.warning++
    else counts.info++
  }
  return {
    sessionId,
    lineCount: lines.length,
    counts,
    truncated,
    evidence: lines.slice(-20)
  }
}

export function findLogAnomalies(sessionId: string, lines: string[], truncated = false) {
  const patterns = [/error/i, /fatal/i, /exception/i, /failed/i, /timeout/i, /watchdog/i, /disconnect/i, /underrun/i]
  const matches = lines.flatMap((text, index) =>
    patterns.some((pattern) => pattern.test(text)) ? [{ lineNumber: index + 1, text }] : []
  )
  return {
    sessionId,
    anomalies: matches.slice(0, 2_000),
    truncated: truncated || matches.length > 2_000
  }
}

export function compareLogLines(
  leftSessionId: string,
  rightSessionId: string,
  leftLines: string[],
  rightLines: string[],
  truncated = false
) {
  const rightSet = new Set(rightLines)
  const leftSet = new Set(leftLines)
  return {
    leftSessionId,
    rightSessionId,
    onlyLeft: leftLines.filter((line) => !rightSet.has(line)).slice(0, 2_000),
    onlyRight: rightLines.filter((line) => !leftSet.has(line)).slice(0, 2_000),
    truncated
  }
}

export function applyLineEnding(text: string, lineEnding?: 'none' | 'LF' | 'CR' | 'CRLF'): string {
  if (lineEnding === 'CRLF') return `${text}\r\n`
  if (lineEnding === 'CR') return `${text}\r`
  if (lineEnding === 'LF') return `${text}\n`
  return text
}
