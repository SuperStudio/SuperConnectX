import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import type { McpFacade, McpPermissionPolicy } from './types.js'
import { DEFAULT_MCP_PERMISSION_POLICY } from './types.js'
import {
  buildAuditEvent,
  shouldAuditTool,
  type McpAuditSink
} from './audit.js'
import {
  createRequestId,
  mapErrorToMcp,
  mcpErrorResult,
  mcpToolResult
} from './result.js'
import type { DeveloperComponent } from './developer-profile.js'

const lease = (facade: McpFacade, sessionId: string, ownerId: string) => {
  if (!facade.assertWriteLease) throw new Error('Write lease required')
  facade.assertWriteLease(sessionId, ownerId)
}

const WRITE = new Set([
  'sendSession',
  'sendSessionAndWait',
  'runTemplateCommand',
  'startSessionPort',
  'startSavedSession',
  'acquireWriteLease',
  'releaseWriteLease'
])
const DESTRUCTIVE = new Set(['stopSession'])
const EXPORT = new Set(['uploadSessionFile'])

export interface CreateMcpServerOptions {
  audit?: McpAuditSink
  components?: DeveloperComponent[]
}

function applyPolicy(facade: McpFacade, policy: McpPermissionPolicy): McpFacade {
  return new Proxy(facade, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') return value
      const name = String(property)
      const permission = WRITE.has(name) ? 'write' : DESTRUCTIVE.has(name) ? 'destructive' : EXPORT.has(name) ? 'export' : undefined
      if (!permission || policy[permission]) return value.bind(target)
      return () => {
        throw new Error(`MCP permission denied: ${permission}`)
      }
    }
  }) as McpFacade
}

function toolMethod(name: string): string {
  const methods: Record<string, string> = {
    session_send: 'sendSession',
    session_send_and_wait: 'sendSessionAndWait',
    session_run_template_command: 'runTemplateCommand',
    session_start_port: 'startSessionPort',
    session_start_saved: 'startSavedSession',
    session_acquire_write_lease: 'acquireWriteLease',
    session_release_write_lease: 'releaseWriteLease',
    session_stop: 'stopSession',
    session_upload_file: 'uploadSessionFile'
  }
  return methods[name] ?? name
}

function wrapTool(
  tool: string,
  audit: McpAuditSink | undefined,
  handler: (args: any) => Promise<unknown>
) {
  return async (args: any = {}) => {
    const requestId = createRequestId()
    try {
      const data = await handler(args)
      if (shouldAuditTool(tool) && audit) {
        void audit.write(
          buildAuditEvent({
            requestId,
            tool,
            args,
            result: 'ok'
          })
        )
      }
      return mcpToolResult(data, { requestId })
    } catch (error) {
      const mapped = mapErrorToMcp(error)
      if (shouldAuditTool(tool) && audit) {
        void audit.write(
          buildAuditEvent({
            requestId,
            tool,
            args,
            result: 'error',
            code: mapped.code,
            message: mapped.message
          })
        )
      }
      return mcpErrorResult(mapped, { requestId })
    }
  }
}

export function createMcpServer(
  facade: McpFacade,
  policy: McpPermissionPolicy = DEFAULT_MCP_PERMISSION_POLICY,
  options: CreateMcpServerOptions = {}
): McpServer {
  const effectivePolicy = { ...DEFAULT_MCP_PERMISSION_POLICY, ...policy }
  facade = applyPolicy(facade, effectivePolicy)
  const audit = options.audit
  const server = new McpServer({ name: 'superconnectx-mcp', version: '0.1.0' })
  const originalRegisterTool = server.registerTool.bind(server)
  server.registerTool = ((name: string, config: any, handler: any) => {
    const method = toolMethod(name)
    const permission = WRITE.has(method)
      ? 'write'
      : DESTRUCTIVE.has(method)
        ? 'destructive'
        : EXPORT.has(method)
          ? 'export'
          : undefined
    if (permission && !effectivePolicy[permission]) return server
    return originalRegisterTool(name as never, config, handler)
  }) as typeof server.registerTool

  server.registerTool(
    'serial_list_ports',
    {
      title: 'List serial ports',
      description: 'List available serial ports.',
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    wrapTool('serial_list_ports', audit, async () => facade.listSerialPorts())
  )
  server.registerTool(
    'session_list',
    {
      title: 'List sessions',
      description: 'List active SuperConnectX sessions.',
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    wrapTool('session_list', audit, async () => facade.listSessions())
  )
  server.registerTool(
    'session_read',
    {
      title: 'Read session buffer',
      description: 'Read bounded session output.',
      inputSchema: {
        sessionId: z.string().min(1),
        maxLines: z.number().int().min(1).max(2000).optional()
      },
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    wrapTool('session_read', audit, async ({ sessionId, maxLines }) =>
      facade.readSession?.(sessionId, { maxLines })
    )
  )
  server.registerTool(
    'log_tail',
    {
      title: 'Tail log',
      description: 'Read a bounded log tail.',
      inputSchema: {
        sessionId: z.string().min(1),
        maxBytes: z.number().int().min(1).max(1048576).optional(),
        maxLines: z.number().int().min(1).max(10000).optional()
      },
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    wrapTool('log_tail', audit, async ({ sessionId, maxBytes, maxLines }) =>
      facade.readLogTail(sessionId, { maxBytes, maxLines })
    )
  )
  server.registerTool(
    'log_search',
    {
      title: 'Search log',
      description: 'Search bounded log evidence.',
      inputSchema: {
        sessionId: z.string().min(1),
        query: z.string().min(1).max(512),
        maxBytes: z.number().int().min(1).max(1048576).optional(),
        maxMatches: z.number().int().min(1).max(2000).optional()
      },
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    wrapTool('log_search', audit, async ({ sessionId, query, maxBytes, maxMatches }) =>
      facade.searchLogs?.(sessionId, query, { maxBytes, maxMatches })
    )
  )
  server.registerTool(
    'template_list',
    {
      title: 'List templates',
      description: 'List loaded device templates.',
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    wrapTool('template_list', audit, async () => (await facade.listTemplates?.()) ?? [])
  )
  server.registerTool(
    'template_get',
    {
      title: 'Get template',
      description: 'Get a device template.',
      inputSchema: { id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/) },
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    wrapTool('template_get', audit, async ({ id }) => (await facade.getTemplate?.(id)) ?? null)
  )
  server.registerTool(
    'log_analyze',
    {
      title: 'Analyze log',
      description: 'Analyze log with a declarative template.',
      inputSchema: {
        sessionId: z.string().min(1),
        templateId: z.string().min(1),
        maxBytes: z.number().int().min(1).max(1048576).optional()
      },
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    wrapTool('log_analyze', audit, async ({ sessionId, templateId, maxBytes }) =>
      facade.analyzeLog?.(sessionId, templateId, { maxBytes })
    )
  )
  server.registerTool(
    'log_summarize',
    {
      title: 'Summarize log',
      description: 'Summarize bounded log evidence.',
      inputSchema: {
        sessionId: z.string().min(1),
        maxBytes: z.number().int().min(1).max(1048576).optional()
      },
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    wrapTool('log_summarize', audit, async ({ sessionId, maxBytes }) =>
      facade.summarizeLog?.(sessionId, { maxBytes })
    )
  )
  server.registerTool(
    'log_find_anomalies',
    {
      title: 'Find log anomalies',
      description: 'Find common error, timeout, restart and disconnect evidence.',
      inputSchema: {
        sessionId: z.string().min(1),
        maxBytes: z.number().int().min(1).max(1048576).optional()
      },
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    wrapTool('log_find_anomalies', audit, async ({ sessionId, maxBytes }) =>
      facade.findLogAnomalies?.(sessionId, { maxBytes })
    )
  )
  server.registerTool(
    'log_compare',
    {
      title: 'Compare logs',
      description: 'Compare bounded evidence from two sessions.',
      inputSchema: {
        leftSessionId: z.string().min(1),
        rightSessionId: z.string().min(1),
        maxBytes: z.number().int().min(1).max(1048576).optional()
      },
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    wrapTool('log_compare', audit, async ({ leftSessionId, rightSessionId, maxBytes }) =>
      facade.compareLogs?.(leftSessionId, rightSessionId, { maxBytes })
    )
  )
  server.registerTool(
    'session_start_port',
    {
      title: 'Start serial session',
      description: 'Start an AI-owned serial session.',
      inputSchema: {
        port: z.string().min(1).max(255),
        baudRate: z.number().int().min(1).max(4000000).optional(),
        ownerId: z.string().min(1)
      }
    },
    wrapTool('session_start_port', audit, async ({ port, baudRate, ownerId }) =>
      facade.startSessionPort?.(port, baudRate, ownerId)
    )
  )
  server.registerTool(
    'session_start_saved',
    {
      title: 'Start saved session',
      description: 'Start an AI-owned saved connection.',
      inputSchema: {
        connectionId: z.number().int().positive(),
        ownerId: z.string().min(1)
      }
    },
    wrapTool('session_start_saved', audit, async ({ connectionId, ownerId }) =>
      facade.startSavedSession?.(connectionId, ownerId)
    )
  )
  server.registerTool(
    'session_acquire_write_lease',
    {
      title: 'Acquire write lease',
      description: 'Acquire a short exclusive write lease.',
      inputSchema: {
        sessionId: z.string().min(1),
        ownerId: z.string().min(1),
        ttlMs: z.number().int().min(1000).max(300000).optional()
      }
    },
    wrapTool('session_acquire_write_lease', audit, async ({ sessionId, ownerId, ttlMs }) =>
      facade.acquireWriteLease?.(sessionId, ownerId, ttlMs)
    )
  )
  server.registerTool(
    'session_release_write_lease',
    {
      title: 'Release write lease',
      description: 'Release a write lease.',
      inputSchema: {
        sessionId: z.string().min(1),
        ownerId: z.string().min(1)
      }
    },
    wrapTool('session_release_write_lease', audit, async ({ sessionId, ownerId }) => {
      await facade.releaseWriteLease?.(sessionId, ownerId)
      return { released: true }
    })
  )
  server.registerTool(
    'session_send',
    {
      title: 'Send command',
      description: 'Send a command with a write lease.',
      inputSchema: {
        sessionId: z.string().min(1),
        command: z.string().min(1).max(4096),
        ownerId: z.string().min(1)
      }
    },
    wrapTool('session_send', audit, async ({ sessionId, command, ownerId }) => {
      lease(facade, sessionId, ownerId)
      return facade.sendSession?.(sessionId, command)
    })
  )
  server.registerTool(
    'session_send_and_wait',
    {
      title: 'Send and wait',
      description: 'Send a command and wait for bounded literal or regex evidence.',
      inputSchema: {
        sessionId: z.string().min(1),
        command: z.string().min(1).max(4096),
        ownerId: z.string().min(1),
        wait: z.object({
          type: z.enum(['literal', 'regex']),
          pattern: z.string().min(1).max(512),
          timeoutMs: z.number().int().min(1).max(120000)
        })
      }
    },
    wrapTool('session_send_and_wait', audit, async ({ sessionId, command, ownerId, wait }) => {
      lease(facade, sessionId, ownerId)
      return facade.sendSessionAndWait?.(sessionId, command, wait)
    })
  )
  server.registerTool(
    'session_run_template_command',
    {
      title: 'Run template command',
      description: 'Run a declarative template command with a write lease.',
      inputSchema: {
        sessionId: z.string().min(1),
        templateId: z.string().min(1),
        commandId: z.string().min(1),
        ownerId: z.string().min(1)
      }
    },
    wrapTool('session_run_template_command', audit, async ({ sessionId, templateId, commandId, ownerId }) => {
      lease(facade, sessionId, ownerId)
      return facade.runTemplateCommand?.(sessionId, templateId, commandId, ownerId)
    })
  )
  server.registerTool(
    'session_upload_file',
    {
      title: 'Upload file',
      description: 'Upload a file to an FTP session with a write lease.',
      inputSchema: {
        sessionId: z.string().min(1),
        localFilePath: z.string().min(1),
        remoteFileName: z.string().min(1),
        ownerId: z.string().min(1)
      },
      annotations: { destructiveHint: true }
    },
    wrapTool('session_upload_file', audit, async ({ sessionId, localFilePath, remoteFileName, ownerId }) => {
      lease(facade, sessionId, ownerId)
      return facade.uploadSessionFile?.(sessionId, localFilePath, remoteFileName, ownerId)
    })
  )
  server.registerTool(
    'session_stop',
    {
      title: 'Stop session',
      description: 'Stop a session with explicit confirmation and a write lease.',
      inputSchema: {
        sessionId: z.string().min(1),
        ownerId: z.string().min(1),
        confirm: z.literal(true)
      },
      annotations: { destructiveHint: true }
    },
    wrapTool('session_stop', audit, async ({ sessionId, ownerId, confirm }) => {
      if (!confirm) throw new Error('Explicit confirmation required')
      lease(facade, sessionId, ownerId)
      return facade.stopSession?.(sessionId)
    })
  )
  for (const component of options.components ?? []) {
    if (component.type !== 'tool' && component.type !== 'parser') continue
    server.registerTool(
      `component_${component.id.replace(/[^a-z0-9_]/g, '_')}`,
      {
        title: component.id,
        description: `Developer ${component.type} component.`,
        inputSchema: { input: z.record(z.string(), z.unknown()).optional() },
        annotations: { readOnlyHint: component.risk === 'read' }
      },
      wrapTool(`component.${component.id}`, audit, async ({ input }) => {
        const imported = await import(pathToFileURL(component.path).href)
        const run = imported.default ?? imported.run
        if (typeof run !== 'function') throw new Error(`Component has no default function: ${component.id}`)
        return await run({ facade, input: input ?? {}, component })
      })
    )
  }
  return server
}
