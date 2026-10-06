import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { summarizeCommand } from './result.js'

export type McpAuditResult = 'ok' | 'error'

export interface McpAuditEvent {
  at: string
  requestId: string
  tool: string
  ownerId?: string
  sessionId?: string
  templateId?: string
  commandId?: string
  summary?: string
  result: McpAuditResult
  code?: string
  message?: string
}

export interface McpAuditSink {
  write(event: McpAuditEvent): void | Promise<void>
}

export const WRITE_AUDIT_TOOLS = new Set([
  'session_start_port',
  'session_start_saved',
  'session_acquire_write_lease',
  'session_release_write_lease',
  'session_send',
  'session_send_and_wait',
  'session_run_template_command',
  'session_upload_file',
  'session_stop'
])

export function shouldAuditTool(tool: string): boolean {
  return WRITE_AUDIT_TOOLS.has(tool)
}

export function buildAuditEvent(input: {
  requestId: string
  tool: string
  args?: Record<string, unknown>
  result: McpAuditResult
  code?: string
  message?: string
}): McpAuditEvent {
  const args = input.args ?? {}
  const command = typeof args.command === 'string' ? args.command : undefined
  const templateId = typeof args.templateId === 'string' ? args.templateId : undefined
  const commandId = typeof args.commandId === 'string' ? args.commandId : undefined
  const summary =
    summarizeCommand(command) ??
    (templateId && commandId ? `template:${templateId}/${commandId}` : undefined) ??
    (typeof args.port === 'string' ? `port:${args.port}` : undefined) ??
    (typeof args.connectionId === 'number' ? `connection:${args.connectionId}` : undefined) ??
    (typeof args.remoteFileName === 'string' ? `upload:${args.remoteFileName}` : undefined)

  return {
    at: new Date().toISOString(),
    requestId: input.requestId,
    tool: input.tool,
    ownerId: typeof args.ownerId === 'string' ? args.ownerId : undefined,
    sessionId: typeof args.sessionId === 'string' ? args.sessionId : undefined,
    templateId,
    commandId,
    summary,
    result: input.result,
    code: input.code,
    message: input.message
  }
}

export class MemoryAuditSink implements McpAuditSink {
  readonly events: McpAuditEvent[] = []
  write(event: McpAuditEvent): void {
    this.events.push(event)
  }
}

export class JsonlFileAuditSink implements McpAuditSink {
  private chain: Promise<void> = Promise.resolve()
  constructor(private readonly filePath: string) {}

  static defaultPath(): string {
    return join(homedir(), '.superconnectx', 'mcp-audit.jsonl')
  }

  write(event: McpAuditEvent): void {
    const line = `${JSON.stringify(event)}\n`
    this.chain = this.chain
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true })
        await appendFile(this.filePath, line, 'utf8')
      })
      .catch(() => {
        // Audit must not break tool execution.
      })
  }
}

export function createDefaultAuditSink(filePath = JsonlFileAuditSink.defaultPath()): McpAuditSink {
  return new JsonlFileAuditSink(filePath)
}

export class CallbackAuditSink implements McpAuditSink {
  constructor(private readonly callback: (event: McpAuditEvent) => void) {}
  write(event: McpAuditEvent): void {
    try {
      this.callback(event)
    } catch {
      // ignore
    }
  }
}
