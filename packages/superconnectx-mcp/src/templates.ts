import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { DeviceTemplate } from './types.js'

const commandSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  text: z.string().max(4096),
  lineEnding: z.enum(['none', 'LF', 'CR', 'CRLF']).optional(),
  risk: z.enum(['read', 'write', 'destructive', 'export']),
  wait: z
    .object({
      type: z.enum(['literal', 'regex']),
      pattern: z.string().min(1).max(512),
      timeoutMs: z.number().int().min(1).max(120_000)
    })
    .optional()
})

export const templateSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  version: z.number().int().positive(),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  connectionTypes: z.array(z.enum(['serial', 'telnet', 'ftp'])).min(1),
  permissions: z.object({
    defaultMode: z.enum(['read-only', 'read-write']),
    allowWrite: z.boolean()
  }),
  commands: z.array(commandSchema).max(200),
  logEvents: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        level: z.enum(['info', 'warning', 'error']),
        pattern: z.string().min(1).max(512),
        summary: z.string().min(1).max(500)
      })
    )
    .max(200)
})

export interface TemplateLoadResult {
  loaded: Array<{ file: string; id: string; version: number }>
  skipped: Array<{ file: string; reason: string }>
}

export function normalizeTemplate(value: unknown, fallbackId?: string): DeviceTemplate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return templateSchema.parse(value)
  const source = value as Record<string, unknown>
  const commands = Array.isArray(source.commands)
    ? source.commands.map((command, index) => normalizeCommand(command, index))
    : source.commands
  const logEvents = Array.isArray(source.logEvents)
    ? source.logEvents.map((event, index) => normalizeLogEvent(event, index))
    : source.logEvents
  return templateSchema.parse({
    id: source.id ?? (fallbackId ? fallbackId.replace(/[^\x00-\x7f]/g, '').replace(/^[^a-z0-9]+/, '').replace(/[^a-z0-9._-]/g, '-') || 'device' : undefined),
    version: source.version ?? 1,
    name: source.name ?? source.id ?? fallbackId,
    description: source.description,
    connectionTypes: source.connectionTypes ?? ['serial'],
    permissions: source.permissions ?? { defaultMode: 'read-only', allowWrite: false },
    commands,
    logEvents: logEvents ?? []
  })
}

function normalizeCommand(value: unknown, index: number): unknown {
  if (typeof value === 'string') {
    const [id, text = id, risk = 'read'] = value.split(/\s+/)
    return { id, label: id, text, risk }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const source = value as Record<string, unknown>
  const id = typeof source.id === 'string' ? source.id : `command-${index + 1}`
  const text = source.text ?? source.command ?? source.send
  const wait = source.wait ?? (typeof source.expect === 'string' ? { type: 'literal', pattern: source.expect, timeoutMs: source.timeoutMs ?? 3000 } : undefined)
  return {
    id,
    label: source.label ?? id,
    text,
    lineEnding: source.lineEnding,
    risk: source.risk ?? 'read',
    wait
  }
}

function normalizeLogEvent(value: unknown, index: number): unknown {
  if (typeof value === 'string') {
    const [pattern, summary = pattern] = value.split(/\s+=>\s+/)
    return { id: `event-${index + 1}`, level: 'info', pattern, summary }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const source = value as Record<string, unknown>
  const pattern = source.pattern ?? source.match
  return {
    id: source.id ?? `event-${index + 1}`,
    level: source.level ?? 'info',
    pattern,
    summary: source.summary ?? pattern
  }
}

export class TemplateRegistry {
  private readonly items = new Map<string, DeviceTemplate>()

  register(value: unknown, fallbackId?: string): DeviceTemplate {
    const template = normalizeTemplate(value, fallbackId)
    const current = this.items.get(template.id)
    if (current && template.version < current.version) {
      throw new Error(`Template version must not decrease: ${template.id}`)
    }
    this.items.set(template.id, template)
    return template
  }

  async loadDirectory(directory: string): Promise<TemplateLoadResult> {
    const result: TemplateLoadResult = { loaded: [], skipped: [] }
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result
      throw error
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue
      const file = join(directory, entry.name)
      try {
        const stem = entry.name.replace(/\.json$/i, '').toLowerCase()
        const slug = stem.replace(/[^a-z0-9._-]/g, '-').replace(/^-+|-+$/g, '')
        const hash = Buffer.from(stem).toString('hex').slice(0, 8)
        const fallbackId = `${slug || 'device'}-${hash}`.replace(/^[^a-z0-9]+/, 'device-')
        const template = this.register(JSON.parse(await readFile(file, 'utf8')), fallbackId)
        result.loaded.push({ file, id: template.id, version: template.version })
      } catch (error) {
        result.skipped.push({ file, reason: error instanceof Error ? error.message : String(error) })
      }
    }
    return result
  }

  list(): Array<Pick<DeviceTemplate, 'id' | 'version' | 'name' | 'description'>> {
    return [...this.items.values()].map(({ id, version, name, description }) => ({
      id,
      version,
      name,
      description
    }))
  }

  get(id: string): DeviceTemplate | undefined {
    return this.items.get(id)
  }
}
