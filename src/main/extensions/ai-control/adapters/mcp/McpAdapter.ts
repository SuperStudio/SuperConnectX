import { randomUUID } from 'crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js'
import AiOperationRegistry from '../../application/AiOperationRegistry'
import PolicyService from '../../application/PolicyService'
import type { AiExecutionContext } from '../../application/AiExecutionContext'
import type { AuditPort } from '../../ports/AuditPort'
import McpResultMapper, { mcpAdvertisedOutputSchema } from './McpResultMapper'
import type { RegisteredToolHandle } from './McpSessionStore'
import { AiOperationError } from '../../application/AiErrors'

export interface PendingMcpServer {
  server: McpServer
  principalId: string
  handles: Map<string, RegisteredToolHandle>
  controllers: Set<AbortController>
}

export default class McpAdapter {
  private readonly mapper = new McpResultMapper()

  constructor(
    private readonly registry: AiOperationRegistry,
    private readonly policy: PolicyService,
    private readonly audit: AuditPort,
    private readonly appVersion: string,
    private readonly logger?: { error: (message: string, meta?: unknown) => void }
  ) {}

  async create(transport: StreamableHTTPServerTransport): Promise<PendingMcpServer> {
    const server = new McpServer(
      { name: 'superconnectx', version: this.appVersion },
      {
        capabilities: { tools: { listChanged: true } },
        instructions:
          'Use bounded cursor tools for serial output. Write tools require local permission and a session write lease. Preserve writeLeaseId returned by session_start_* or session_acquire_write and include it in later write calls, especially after MCP reconnects.'
      }
    )
    const principalId = randomUUID()
    const handles = new Map<string, RegisteredToolHandle>()
    const controllers = new Set<AbortController>()

    for (const definition of this.registry.list()) {
      const handle = server.registerTool(
        definition.name,
        {
          description: definition.description,
          inputSchema: definition.inputSchema,
          // Registry schema 继续只校验成功结果；公开给 MCP Client 的 schema 同时
          // 接受统一 { data: { error } }，避免业务拒绝被 Client 改写成 -32602。
          outputSchema: mcpAdvertisedOutputSchema(definition.outputSchema),
          annotations: definition.annotations
        },
        async (
          input: Record<string, unknown>,
          extra: RequestHandlerExtra<ServerRequest, ServerNotification>
        ) => {
          const client = server.server.getClientVersion()
          const clientName = client?.name || 'unknown-client'
          const controller = new AbortController()
          controllers.add(controller)
          const timeout = AbortSignal.timeout(definition.deadlineMs)
          const signal = AbortSignal.any([extra.signal, timeout, controller.signal])
          const context: AiExecutionContext = {
            principalId,
            clientName,
            signal,
            requestId: extra.requestId
          }
          try {
            await this.policy.assert(definition.name, definition.capabilityGroup, definition.access)
            const result = await definition.handler(input, context)
            definition.outputSchema.parse({ data: result })
            this.audit.record({
              operation: definition.name,
              action: definition.access === 'read' ? 'read' : 'control',
              status: 'success',
              principalId,
              clientName,
              sessionId: typeof input.sessionId === 'string' ? input.sessionId : undefined,
              details: this.activityDetails(input)
            })
            return this.mapper.success(result)
          } catch (error) {
            if (!(error instanceof AiOperationError)) {
              this.logger?.error(`[McpAdapter] ${definition.name} failed`, error)
            }
            const mapped = this.mapper.failure(error)
            const errorData = mapped.structuredContent.data.error
            this.audit.record({
              operation: definition.name,
              action: definition.access === 'read' ? 'read' : 'control',
              status: 'failed',
              principalId,
              clientName,
              sessionId: typeof input.sessionId === 'string' ? input.sessionId : undefined,
              errorCode: errorData.code,
              details: this.activityDetails(input)
            })
            return mapped
          } finally {
            controllers.delete(controller)
          }
        }
      ) as RegisteredToolHandle
      handles.set(definition.name, handle)
      if (!this.policy.isVisible(definition.name, definition.capabilityGroup, definition.access))
        handle.disable()
    }
    await server.connect(transport)
    return { server, principalId, handles, controllers }
  }

  refreshVisibility(pending: PendingMcpServer): void {
    for (const definition of this.registry.list()) {
      const handle = pending.handles.get(definition.name)
      if (!handle) continue
      if (this.policy.isVisible(definition.name, definition.capabilityGroup, definition.access))
        handle.enable()
      else handle.disable()
    }
  }

  toolCount(): number {
    return this.registry.list().length
  }

  private activityDetails(input: Record<string, unknown>): Record<string, unknown> {
    const details: Record<string, unknown> = {}
    for (const key of ['sessionId', 'connectionId', 'groupId', 'commandId', 'domain', 'text']) {
      if (input[key] !== undefined) details[key === 'text' ? 'command' : key] = input[key]
    }
    return details
  }
}
