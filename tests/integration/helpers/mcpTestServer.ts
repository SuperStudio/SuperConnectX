import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import * as z from 'zod/v4'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import AiOperationRegistry, {
  dataOutputSchema,
  operation
} from '../../../src/main/extensions/ai-control/application/AiOperationRegistry'
import PolicyService from '../../../src/main/extensions/ai-control/application/PolicyService'
import SessionLeaseService from '../../../src/main/extensions/ai-control/application/SessionLeaseService'
import McpAdapter from '../../../src/main/extensions/ai-control/adapters/mcp/McpAdapter'
import McpServerManager from '../../../src/main/extensions/ai-control/adapters/mcp/McpServerManager'
import AiConfigService from '../../../src/main/extensions/ai-control/infrastructure/AiConfigService'
import AiConfigStorage from '../../../src/main/extensions/ai-control/infrastructure/AiConfigStorage'
import RuntimeAuthorizationService from '../../../src/main/extensions/ai-control/application/RuntimeAuthorizationService'
import { createSessionHandlers } from '../../../src/main/extensions/ai-control/application/handlers/SessionHandlers'
import CommandScheduler from '../../../src/main/extensions/ai-control/application/CommandScheduler'
import type { SessionSnapshot } from '../../../src/main/services/types/RuntimeTypes'
import type { SessionCommandSettings } from '../../../src/main/extensions/ai-control/ports/SessionCommandSettingsPort'
import { AiOperationError } from '../../../src/main/extensions/ai-control/application/AiErrors'

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

export interface McpTestHarness {
  endpoint: string
  token: string
  manager: McpServerManager
  storage: AiConfigStorage
  config: AiConfigService
  calls: { active: number; maximum: number }
  sessionCalls: { active: number; maximum: number; order: string[] }
  runGuiWrite(task: () => Promise<void>): Promise<void>
  setSessionSettings(settings: SessionCommandSettings): void
  connect(name?: string): Promise<Client>
  terminate(client: Client): Promise<void>
  close(): Promise<void>
}

export async function createMcpTestHarness(
  options: {
    port?: number
    expectedState?: 'running' | 'port_conflict'
    withSessionHandlers?: boolean
    withSessionLifecycle?: boolean
  } = {}
): Promise<McpTestHarness> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-mcp-'))
  const storage = new AiConfigStorage(path.join(directory, 'ai-bridge.json'))
  const initial = await storage.init()
  const port = options.port ?? (await freePort())
  await storage.patch(0, {
    expectedRevision: initial.revision,
    instance: { enabled: true, portOverride: port }
  })
  const config = new AiConfigService(storage, 0)
  const calls = { active: 0, maximum: 0 }
  const sessionCalls = { active: 0, maximum: 0, order: [] as string[] }
  let sessionSettings: SessionCommandSettings = {
    autoNewline: false,
    hexMode: false,
    crcEnabled: false,
    crcMethod: 'CRC-16/MODBUS'
  }
  const scheduler = new CommandScheduler()
  const testSession: SessionSnapshot = {
    sessionId: 'shared-session',
    state: 'connected',
    connectionType: 'com',
    comName: 'COM80',
    desiredConfig: {},
    updatedAt: new Date().toISOString(),
    createdBySource: 'gui'
  }
  const runtimeSessions = new Map<string, SessionSnapshot>()
  if (options.withSessionHandlers && !options.withSessionLifecycle)
    runtimeSessions.set(testSession.sessionId, testSession)
  const leases = new SessionLeaseService()
  const sessionDefinitions = options.withSessionHandlers
    ? createSessionHandlers({
        sessions: {
          list: () => [...runtimeSessions.values()],
          get: (sessionId: string) => runtimeSessions.get(sessionId),
          startSaved: async () => ({ success: false }),
          startPort: async (portPath: string, sessionId: string) => {
            const session: SessionSnapshot = {
              sessionId,
              state: 'connected',
              connectionType: 'com',
              comName: portPath,
              desiredConfig: {},
              updatedAt: new Date().toISOString(),
              createdBySource: 'ai'
            }
            runtimeSessions.set(sessionId, session)
            return { success: true, session }
          },
          stop: async (sessionId: string) => {
            runtimeSessions.delete(sessionId)
            return { success: true, sessionId }
          },
          send: async (_sessionId: string, command: string) => {
            sessionCalls.active += 1
            sessionCalls.maximum = Math.max(sessionCalls.maximum, sessionCalls.active)
            sessionCalls.order.push(`ai:${command}:start`)
            await new Promise((resolve) => setTimeout(resolve, 20))
            sessionCalls.order.push(`ai:${command}:end`)
            sessionCalls.active -= 1
            return { success: true }
          }
        },
        settings: {
          getEffectiveSettings: () => ({ ...sessionSettings })
        },
        events: {
          read: () => ({
            events: [],
            truncated: false,
            oldestSequence: 0,
            latestSequence: 0,
            nextCursor: 0,
            returnedBytes: 0,
            droppedEvents: 0,
            droppedBytes: 0
          }),
          wait: async () => ({
            events: [],
            truncated: false,
            oldestSequence: 0,
            latestSequence: 0,
            nextCursor: 0,
            returnedBytes: 0,
            droppedEvents: 0,
            droppedBytes: 0
          }),
          latestSequence: () => 0
        },
        serial: {
          list: async () => (options.withSessionLifecycle ? [{ path: 'COM80' }] : []),
          normalize: (value: string) => value,
          equals: (left: string, right: string) => left === right
        },
        leases,
        scheduler,
        canCloseUserOpenedConnection: () => false
      })
    : []
  const registry = new AiOperationRegistry([
    operation({
      name: 'server_get_info',
      description: 'Return test server information',
      capabilityGroup: 'sessionRead',
      access: 'read',
      inputSchema: z.object({}).strict(),
      outputSchema: dataOutputSchema(
        z.object({ name: z.string(), transport: z.string() }).strict()
      ),
      errorCodes: [],
      handler: async () => ({ name: 'superconnectx', transport: 'streamable-http' })
    }),
    operation({
      name: 'test_echo',
      description: 'Echo text for MCP contract testing',
      capabilityGroup: 'sessionRead',
      access: 'read',
      inputSchema: z
        .object({
          text: z.string().max(1024),
          delayMs: z.number().int().min(0).max(1000).optional()
        })
        .strict(),
      outputSchema: dataOutputSchema(z.object({ text: z.string() }).strict()),
      errorCodes: [],
      handler: async (input, context) => {
        calls.active += 1
        calls.maximum = Math.max(calls.maximum, calls.active)
        try {
          const delayMs = typeof input.delayMs === 'number' ? input.delayMs : 0
          if (delayMs)
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, delayMs)
              context.signal.addEventListener(
                'abort',
                () => {
                  clearTimeout(timer)
                  reject(context.signal.reason)
                },
                { once: true }
              )
            })
          return { text: input.text }
        } finally {
          calls.active -= 1
        }
      }
    }),
    operation({
      name: 'test_write',
      description: 'Exercise runtime write authorization',
      capabilityGroup: 'serialWrite',
      access: 'write',
      inputSchema: z.object({}).strict(),
      outputSchema: dataOutputSchema(z.object({ accepted: z.boolean() }).strict()),
      errorCodes: [],
      handler: async () => ({ accepted: true })
    }),
    operation({
      name: 'test_failure',
      description: 'Return one stable structured business error for output contract testing',
      capabilityGroup: 'sessionRead',
      access: 'read',
      inputSchema: z.object({}).strict(),
      outputSchema: dataOutputSchema(z.object({ accepted: z.literal(true) }).strict()),
      errorCodes: ['CONFIG_SCOPE_DENIED'],
      handler: async () => {
        throw new AiOperationError(
          'CONFIG_SCOPE_DENIED',
          'AI security configuration is not exposed'
        )
      }
    }),
    ...sessionDefinitions
  ])
  const authorization = new RuntimeAuthorizationService()
  authorization.setPermission('full-control')
  const policy = new PolicyService(config, authorization)
  const adapter = new McpAdapter(registry, policy, { record: () => undefined }, 'test')
  const manager = new McpServerManager(0, config, adapter, leases, authorization)
  const transports = new WeakMap<Client, StreamableHTTPClientTransport>()
  await manager.start()
  const status = manager.getStatus()
  const expectedState = options.expectedState ?? 'running'
  if (status.state !== expectedState)
    throw new Error(status.lastError || `Unexpected MCP state: ${status.state}`)

  return {
    endpoint: status.endpoint,
    token: config.getInstance().token,
    manager,
    storage,
    config,
    calls,
    sessionCalls,
    setSessionSettings: (settings) => {
      sessionSettings = { ...settings }
    },
    runGuiWrite: (task) =>
      scheduler.run('shared-session', 'gui', async () => {
        sessionCalls.active += 1
        sessionCalls.maximum = Math.max(sessionCalls.maximum, sessionCalls.active)
        sessionCalls.order.push('gui:start')
        try {
          await task()
        } finally {
          sessionCalls.order.push('gui:end')
          sessionCalls.active -= 1
        }
      }),
    async connect(name = 'vitest-mcp-client') {
      const client = new Client({ name, version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(status.endpoint), {
        requestInit: { headers: { Authorization: `Bearer ${config.getInstance().token}` } }
      })
      await client.connect(transport)
      transports.set(client, transport)
      return client
    },
    async terminate(client) {
      await transports.get(client)?.terminateSession()
    },
    async close() {
      await manager.dispose()
      scheduler.dispose()
      storage.dispose()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
}
