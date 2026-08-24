import { randomUUID } from 'crypto'
import * as z from 'zod/v4'
import { prepareCommand } from '../../../../../shared/serial/CommandPreparation'
import { checkData } from '../../../../utils/DataCheckEngine'
import type { SessionPort } from '../../ports/SessionPort'
import type { SessionCommandSettingsPort } from '../../ports/SessionCommandSettingsPort'
import type { EventPort } from '../../ports/EventPort'
import type { SerialPortCatalog } from '../../ports/SerialPortCatalog'
import CommandScheduler from '../CommandScheduler'
import SessionLeaseService from '../SessionLeaseService'
import { AiOperationError } from '../AiErrors'
import { AI_ERROR_CODES } from '../AiErrorCodes'
import type { AiOperationDefinition } from '../AiOperationRegistry'
import { dataOutputSchema, operation } from '../AiOperationRegistry'
import {
  eventBatchSchema,
  genericResultOutputSchema,
  sessionSnapshotSchema
} from '../AiOperationSchemas'

interface Dependencies {
  sessions: SessionPort
  settings: SessionCommandSettingsPort
  events: EventPort
  serial: SerialPortCatalog
  leases: SessionLeaseService
  scheduler: CommandScheduler
  canCloseUserOpenedConnection: () => boolean
}

const sessionId = z.string().min(1).max(160)
const writeLeaseId = z.string().min(20).max(200).optional()
const cursorFields = {
  afterCursor: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(1000).default(100),
  maxBytes: z
    .number()
    .int()
    .min(1024)
    .max(128 * 1024)
    .default(64 * 1024)
}

const writeLeaseSchema = z
  .object({
    sessionId: z.string(),
    writeLeaseId: z.string(),
    acquiredAt: z.number(),
    lastWriteAt: z.number()
  })
  .strict()

const waitPatternResultSchema = z
  .object({
    matched: z.boolean(),
    pattern: z.string(),
    nextCursor: z.number().int().nonnegative(),
    text: z.string()
  })
  .strict()

function requireSuccess(result: object, action: string): object {
  if ((result as { success?: boolean }).success === false) {
    const value = result as { code?: string; message?: string }
    throw new AiOperationError(
      AI_ERROR_CODES.BACKEND_OPERATION_FAILED,
      value.message || `${action} failed`,
      false,
      value.code ? { backendCode: value.code } : undefined
    )
  }
  return result
}

export function createSessionHandlers(deps: Dependencies): AiOperationDefinition[] {
  const send = async (
    id: string,
    text: string,
    principalId: string,
    suppliedWriteLeaseId: string | undefined,
    signal: AbortSignal
  ): Promise<object> => {
    if (!deps.sessions.get(id))
      throw new AiOperationError('SESSION_NOT_FOUND', `Session not found: ${id}`)
    const lease = deps.leases.acquireWrite(id, principalId, suppliedWriteLeaseId)
    const prepared = await prepareCommand(
      text,
      deps.settings.getEffectiveSettings(id),
      async (hex, method) => checkData(method, hex).hexResult
    )
    const result = await deps.scheduler.run(
      id,
      'ai',
      () =>
        deps.sessions.send(id, prepared.data, 'ai', {
          input: prepared.input,
          displayCommand: prepared.displayCommand,
          preparedBySoftware: true
        }),
      signal
    )
    requireSuccess(result, 'send command')
    deps.leases.touchWrite(id, principalId)
    return {
      accepted: true,
      sessionId: id,
      writeLeaseId: lease.writeLeaseId,
      byteLength: prepared.byteLength,
      displayCommand: prepared.displayCommand
    }
  }

  return [
    operation({
      name: 'session_list',
      description: 'List runtime sessions.',
      capabilityGroup: 'sessionRead',
      access: 'read',
      inputSchema: z.object({}).strict(),
      outputSchema: dataOutputSchema(
        z.object({ sessions: z.array(sessionSnapshotSchema) }).strict()
      ),
      errorCodes: [],
      handler: async () => ({ sessions: deps.sessions.list() })
    }),
    operation({
      name: 'session_start_saved',
      description:
        'Start a session from a saved connection profile. Preserve the returned writeLeaseId for later write calls, including calls made after MCP reconnects.',
      capabilityGroup: 'sessionManage',
      access: 'write',
      inputSchema: z
        .object({
          connectionId: z.number().int().positive(),
          extraFields: z.record(z.string(), z.unknown()).optional()
        })
        .strict(),
      outputSchema: dataOutputSchema(
        z.object({ sessionId: z.string(), writeLeaseId: z.string() }).passthrough()
      ),
      errorCodes: [AI_ERROR_CODES.SESSION_ALREADY_EXISTS, AI_ERROR_CODES.BACKEND_OPERATION_FAILED],
      handler: async (input, context) => {
        const id = `mcp-${randomUUID()}`
        const result = await deps.sessions.startSaved(input.connectionId as number, id, {
          ...((input.extraFields as Record<string, unknown> | undefined) || {}),
          createdByPrincipalId: context.principalId
        })
        requireSuccess(result, 'start saved session')
        const reusedSession = (result as { session?: { sessionId?: unknown } }).session
        const actualId = reusedSession?.sessionId ? String(reusedSession.sessionId) : id
        const lease = deps.leases.acquireWrite(actualId, context.principalId)
        return { ...result, sessionId: actualId, writeLeaseId: lease.writeLeaseId }
      }
    }),
    operation({
      name: 'session_start_port',
      description:
        'Start a temporary session on an available serial port. Preserve the returned writeLeaseId for later write calls, including calls made after MCP reconnects.',
      capabilityGroup: 'sessionManage',
      access: 'write',
      inputSchema: z
        .object({
          portPath: z.string().min(1).max(4096),
          baudRate: z.number().int().positive().optional(),
          dataBits: z.number().int().min(5).max(8).optional(),
          stopBits: z.union([z.literal(1), z.literal(1.5), z.literal(2)]).optional(),
          parity: z.enum(['none', 'even', 'odd', 'mark', 'space']).optional(),
          encoding: z.string().max(80).optional(),
          autoNewline: z.boolean().optional(),
          hexMode: z.boolean().optional(),
          crcEnabled: z.boolean().optional(),
          crcMethod: z.string().max(80).optional()
        })
        .strict(),
      outputSchema: dataOutputSchema(
        z
          .object({ sessionId: z.string(), portPath: z.string(), writeLeaseId: z.string() })
          .passthrough()
      ),
      errorCodes: [
        AI_ERROR_CODES.PORT_NOT_FOUND,
        AI_ERROR_CODES.SESSION_ALREADY_EXISTS,
        AI_ERROR_CODES.BACKEND_OPERATION_FAILED
      ],
      handler: async (input, context) => {
        const requested = deps.serial.normalize(String(input.portPath))
        const matched = (await deps.serial.list()).find((port) =>
          deps.serial.equals(port.path, requested)
        )
        if (!matched)
          throw new AiOperationError('PORT_NOT_FOUND', `Serial port is not available: ${requested}`)
        const id = `mcp-${randomUUID()}`
        const fields = { ...input }
        delete fields.portPath
        const result = await deps.sessions.startPort(matched.path, id, {
          ...fields,
          createdByPrincipalId: context.principalId
        })
        requireSuccess(result, 'start port session')
        const reusedSession = (result as { session?: { sessionId?: unknown } }).session
        const actualId = reusedSession?.sessionId ? String(reusedSession.sessionId) : id
        const lease = deps.leases.acquireWrite(actualId, context.principalId)
        return {
          ...result,
          sessionId: actualId,
          portPath: matched.path,
          writeLeaseId: lease.writeLeaseId
        }
      }
    }),
    operation({
      name: 'session_acquire_write',
      description:
        'Acquire the AI write lease for a runtime session. Pass an existing writeLeaseId to continue the same workflow from another MCP session.',
      capabilityGroup: 'serialWrite',
      access: 'write',
      inputSchema: z.object({ sessionId, writeLeaseId }).strict(),
      outputSchema: dataOutputSchema(writeLeaseSchema),
      errorCodes: [AI_ERROR_CODES.SESSION_NOT_FOUND, AI_ERROR_CODES.SESSION_WRITE_LOCKED],
      handler: async (input, context) => {
        const id = String(input.sessionId)
        if (!deps.sessions.get(id))
          throw new AiOperationError('SESSION_NOT_FOUND', `Session not found: ${id}`)
        const lease = deps.leases.acquireWrite(
          id,
          context.principalId,
          input.writeLeaseId as string | undefined
        )
        return {
          sessionId: lease.sessionId,
          writeLeaseId: lease.writeLeaseId,
          acquiredAt: lease.acquiredAt,
          lastWriteAt: lease.lastWriteAt
        }
      }
    }),
    operation({
      name: 'session_release_write',
      description:
        'Release the caller write lease. A valid writeLeaseId also allows release after an MCP reconnect.',
      capabilityGroup: 'serialWrite',
      access: 'write',
      inputSchema: z.object({ sessionId, writeLeaseId }).strict(),
      outputSchema: dataOutputSchema(
        z.object({ sessionId: z.string(), released: z.boolean() }).strict()
      ),
      errorCodes: [],
      handler: async (input, context) => ({
        sessionId: input.sessionId,
        ...deps.leases.releaseWrite(
          String(input.sessionId),
          context.principalId,
          input.writeLeaseId as string | undefined
        )
      })
    }),
    operation({
      name: 'session_stop',
      description:
        'Stop a runtime session. Include the writeLeaseId returned by start/acquire when the call may use another MCP session.',
      capabilityGroup: 'sessionManage',
      access: 'write',
      annotations: { destructiveHint: true },
      inputSchema: z.object({ sessionId, writeLeaseId }).strict(),
      outputSchema: genericResultOutputSchema,
      errorCodes: [
        AI_ERROR_CODES.CLOSE_USER_CONNECTION_DENIED,
        AI_ERROR_CODES.SESSION_WRITE_LOCKED,
        AI_ERROR_CODES.BACKEND_OPERATION_FAILED
      ],
      handler: async (input, context) => {
        const id = String(input.sessionId)
        const session = deps.sessions.get(id)
        if (!session) return { success: true, alreadyClosed: true, sessionId: id }
        const source = session.createdBySource
        if (source !== 'ai' && !deps.canCloseUserOpenedConnection())
          throw new AiOperationError(
            'CLOSE_USER_CONNECTION_DENIED',
            'AI is not allowed to close a connection opened by the user'
          )
        deps.leases.acquireWrite(id, context.principalId, input.writeLeaseId as string | undefined)
        const result = requireSuccess(await deps.sessions.stop(id), 'stop session')
        deps.leases.releaseSession(id)
        return result
      }
    }),
    operation({
      name: 'session_send',
      description:
        'Prepare and send a command using current session settings. Include the writeLeaseId returned by start/acquire when the call may use another MCP session.',
      capabilityGroup: 'serialWrite',
      access: 'write',
      inputSchema: z
        .object({
          sessionId,
          writeLeaseId,
          text: z
            .string()
            .min(1)
            .max(256 * 1024)
        })
        .strict(),
      outputSchema: dataOutputSchema(
        z
          .object({
            accepted: z.literal(true),
            sessionId: z.string(),
            writeLeaseId: z.string(),
            byteLength: z.number().int().nonnegative(),
            displayCommand: z.string()
          })
          .strict()
      ),
      errorCodes: [
        AI_ERROR_CODES.SESSION_NOT_FOUND,
        AI_ERROR_CODES.SESSION_WRITE_LOCKED,
        AI_ERROR_CODES.BACKEND_OPERATION_FAILED
      ],
      handler: async (input, context) =>
        send(
          String(input.sessionId),
          String(input.text),
          context.principalId,
          input.writeLeaseId as string | undefined,
          context.signal
        )
    }),
    operation({
      name: 'session_read_events',
      description: 'Read bounded session events after a cursor.',
      capabilityGroup: 'sessionRead',
      access: 'read',
      inputSchema: z.object({ sessionId, ...cursorFields }).strict(),
      outputSchema: dataOutputSchema(eventBatchSchema),
      errorCodes: [],
      handler: async (input) =>
        deps.events.read(
          Number(input.afterCursor),
          Number(input.limit),
          { sessionIds: [String(input.sessionId)] },
          Number(input.maxBytes)
        )
    }),
    operation({
      name: 'session_read_buffer',
      description: 'Read bounded RX/TX buffer events after a cursor.',
      capabilityGroup: 'sessionRead',
      access: 'read',
      inputSchema: z.object({ sessionId, ...cursorFields }).strict(),
      outputSchema: dataOutputSchema(eventBatchSchema),
      errorCodes: [],
      handler: async (input) =>
        deps.events.read(
          Number(input.afterCursor),
          Number(input.limit),
          {
            sessionIds: [String(input.sessionId)],
            eventTypes: ['rx.display', 'tx.accepted', 'tx.failed']
          },
          Number(input.maxBytes)
        )
    }),
    operation({
      name: 'session_wait_events',
      description: 'Wait for bounded session events after a cursor.',
      capabilityGroup: 'sessionRead',
      access: 'read',
      deadlineMs: 35_000,
      inputSchema: z
        .object({
          sessionId,
          afterCursor: z.number().int().nonnegative().default(0),
          timeoutMs: z.number().int().min(1).max(30_000).default(5_000)
        })
        .strict(),
      outputSchema: dataOutputSchema(eventBatchSchema),
      errorCodes: [AI_ERROR_CODES.RESOURCE_LIMIT],
      handler: async (input, context) =>
        deps.events.wait(
          Number(input.afterCursor),
          { sessionIds: [String(input.sessionId)] },
          Number(input.timeoutMs),
          context.signal
        )
    }),
    operation({
      name: 'session_wait_pattern',
      description: 'Wait until session RX contains a literal pattern.',
      capabilityGroup: 'sessionRead',
      access: 'read',
      deadlineMs: 35_000,
      inputSchema: z
        .object({
          sessionId,
          afterCursor: z.number().int().nonnegative().default(0),
          pattern: z.string().min(1).max(1024),
          timeoutMs: z.number().int().min(1).max(30_000).default(5_000)
        })
        .strict(),
      outputSchema: dataOutputSchema(waitPatternResultSchema),
      errorCodes: [AI_ERROR_CODES.RESOURCE_LIMIT],
      handler: async (input, context) =>
        waitPattern(
          deps.events,
          String(input.sessionId),
          Number(input.afterCursor),
          String(input.pattern),
          Number(input.timeoutMs),
          context.signal
        )
    }),
    operation({
      name: 'session_send_and_wait',
      description:
        'Atomically send a command and wait for a literal RX pattern. Include the writeLeaseId returned by start/acquire when the call may use another MCP session.',
      capabilityGroup: 'serialWrite',
      access: 'write',
      deadlineMs: 35_000,
      inputSchema: z
        .object({
          sessionId,
          writeLeaseId,
          text: z
            .string()
            .min(1)
            .max(256 * 1024),
          pattern: z.string().min(1).max(1024),
          timeoutMs: z.number().int().min(1).max(30_000).default(5_000)
        })
        .strict(),
      outputSchema: dataOutputSchema(
        z
          .object({
            writeLeaseId: z.string(),
            sent: z
              .object({
                accepted: z.literal(true),
                byteLength: z.number().int().nonnegative(),
                displayCommand: z.string()
              })
              .strict(),
            observed: waitPatternResultSchema
          })
          .strict()
      ),
      errorCodes: [
        AI_ERROR_CODES.SESSION_NOT_FOUND,
        AI_ERROR_CODES.SESSION_WRITE_LOCKED,
        AI_ERROR_CODES.BACKEND_OPERATION_FAILED,
        AI_ERROR_CODES.RESOURCE_LIMIT
      ],
      handler: async (input, context) => {
        const id = String(input.sessionId)
        if (!deps.sessions.get(id))
          throw new AiOperationError('SESSION_NOT_FOUND', `Session not found: ${id}`)
        const lease = deps.leases.acquireWrite(
          id,
          context.principalId,
          input.writeLeaseId as string | undefined
        )
        return deps.scheduler.runExclusive(
          id,
          'ai',
          async (signal) => {
            const cursor = deps.events.latestSequence()
            const prepared = await prepareCommand(
              String(input.text),
              deps.settings.getEffectiveSettings(id),
              async (hex, method) => checkData(method, hex).hexResult
            )
            requireSuccess(
              await deps.sessions.send(id, prepared.data, 'ai', {
                input: prepared.input,
                displayCommand: prepared.displayCommand,
                preparedBySoftware: true
              }),
              'send command'
            )
            deps.leases.touchWrite(id, context.principalId)
            const observed = await waitPattern(
              deps.events,
              id,
              cursor,
              String(input.pattern),
              Number(input.timeoutMs),
              signal
            )
            return {
              writeLeaseId: lease.writeLeaseId,
              sent: {
                accepted: true,
                byteLength: prepared.byteLength,
                displayCommand: prepared.displayCommand
              },
              observed
            }
          },
          context.signal
        )
      }
    })
  ]
}

async function waitPattern(
  events: EventPort,
  id: string,
  after: number,
  pattern: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<unknown> {
  const deadline = Date.now() + timeoutMs
  let cursor = after
  let text = ''
  while (Date.now() < deadline) {
    const batch = await events.wait(
      cursor,
      { sessionIds: [id], eventTypes: ['rx.display'] },
      Math.min(1_000, deadline - Date.now()),
      signal
    )
    for (const event of batch.events)
      if (typeof event.payload.data === 'string') text += event.payload.data
    if (text.includes(pattern))
      return { matched: true, pattern, nextCursor: batch.nextCursor, text: text.slice(-64 * 1024) }
    cursor = Math.max(cursor, batch.nextCursor)
    if (text.length > 64 * 1024) text = text.slice(-64 * 1024)
  }
  return { matched: false, pattern, nextCursor: cursor, text }
}
