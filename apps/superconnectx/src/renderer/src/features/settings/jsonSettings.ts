/**
 * Settings JSON editing helpers.
 *
 * Kept free of Vue / Electron dependencies so they can be unit tested and reused.
 */

export interface SettingsJsonParseSuccess {
  ok: true
  value: Record<string, any>
}

export interface SettingsJsonParseFailure {
  ok: false
  /** Raw parser message, optionally suffixed with a human friendly line/column hint. */
  error: string
  line?: number
  column?: number
}

export type SettingsJsonParseResult = SettingsJsonParseSuccess | SettingsJsonParseFailure

export const SETTINGS_JSON_INDENT = 2

/** Serialize settings for display inside the editor. */
export function stringifySettings(value: unknown): string {
  return JSON.stringify(value ?? {}, null, SETTINGS_JSON_INDENT)
}

/**
 * Parse raw editor text into a settings object.
 * Only a plain JSON object is accepted — the settings document is always key/value based.
 */
export function parseSettingsJson(text: string): SettingsJsonParseResult {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    const location = locateJsonError(error, text)
    return { ok: false, error: location.message, line: location.line, column: location.column }
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'JSON root must be an object' }
  }

  return { ok: true, value: { ...(value as Record<string, any>) } }
}

/** Merge editor content over defaults, mirroring how persisted settings are loaded. */
export function mergeSettingsWithDefaults(
  defaults: Record<string, any> | undefined,
  parsed: Record<string, any>
): Record<string, any> {
  return { ...(defaults ?? {}), ...parsed }
}

/** Structural comparison used to skip redundant writes while typing. */
export function isSameSettings(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
  } catch {
    // Circular structures cannot appear in serialized settings, but stay defensive.
    return false
  }
}

/**
 * Native JSON errors already embed a character offset — turn it into 1-based line/column
 * so users can jump straight to the offending character.
 */
function locateJsonError(error: unknown, text: string): { message: string; line?: number; column?: number } {
  const raw = error instanceof Error ? error.message : String(error)
  return { message: raw, ...extractLocation(raw, text) }
}

/**
 * V8 emits several message shapes across versions:
 *  - "... at position 12 (line 3 column 1)"      → prefer the explicit line/column
 *  - "... at position 12"                        → derive line/column from the offset
 *  - "Unexpected token '}', ..."                 → no location available, keep the raw message
 */
function extractLocation(message: string, text: string): { line?: number; column?: number } {
  const explicit = /\(line (\d+) column (\d+)\)/.exec(message)
  if (explicit) {
    return { line: Number(explicit[1]), column: Number(explicit[2]) }
  }

  const positioned = /at position (\d+)/.exec(message)
  if (!positioned) return {}

  const position = Number(positioned[1])
  if (!Number.isFinite(position) || position < 0) return {}

  const before = text.slice(0, position)
  const lastBreak = before.lastIndexOf('\n')
  return {
    line: before.split('\n').length,
    column: lastBreak === -1 ? position + 1 : position - lastBreak
  }
}
