import * as z from 'zod/v4'
import { dataOutputSchema } from './AiOperationRegistry'

export const unknownRecordSchema = z.record(z.string(), z.unknown())

export const sessionSnapshotSchema = z
  .object({
    sessionId: z.string(),
    state: z.enum(['starting', 'connected', 'stopping', 'error', 'closed', 'unknown']),
    connectionType: z.string().optional(),
    name: z.string().optional(),
    comName: z.string().optional(),
    host: z.string().optional(),
    port: z.number().optional(),
    desiredConfig: unknownRecordSchema,
    connectedAt: z.string().optional(),
    updatedAt: z.string(),
    createdBySource: z.enum(['gui', 'ai', 'system']).optional(),
    createdByPrincipalId: z.string().optional()
  })
  .strict()

export const runtimeEventSchema = z
  .object({
    eventId: z.string(),
    sequence: z.number().int(),
    timestamp: z.string(),
    eventType: z.string(),
    sessionId: z.string().optional(),
    source: z.enum(['gui', 'ai', 'system']),
    payload: unknownRecordSchema
  })
  .strict()

export const eventBatchSchema = z
  .object({
    events: z.array(runtimeEventSchema),
    truncated: z.boolean(),
    oldestSequence: z.number().int(),
    latestSequence: z.number().int(),
    nextCursor: z.number().int(),
    returnedBytes: z.number().int().nonnegative(),
    droppedEvents: z.number().int().nonnegative(),
    droppedBytes: z.number().int().nonnegative()
  })
  .strict()

export const configSnapshotSchema = z
  .object({
    domain: z.string(),
    targetId: z.string().nullable(),
    value: unknownRecordSchema.nullable(),
    revision: z.number().int().nonnegative()
  })
  .strict()

export const configFieldSchema = z
  .object({
    path: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'enum', 'array', 'object']),
    enum: z.array(z.union([z.string(), z.number()])).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    readable: z.boolean(),
    writable: z.boolean(),
    secret: z.boolean(),
    applyMode: z.enum(['immediate', 'reconnect', 'restart', 'task']),
    aliases: z.array(z.string()).optional()
  })
  .strict()

export const configDomainSchema = z
  .object({
    domain: z.string(),
    targetRequired: z.boolean(),
    fields: z.array(configFieldSchema)
  })
  .strict()

export const genericResultOutputSchema = dataOutputSchema(unknownRecordSchema)

export const revisionedListOutputSchema = (field: string): z.ZodType<Record<string, unknown>> =>
  dataOutputSchema(
    z
      .object({
        [field]: z.array(unknownRecordSchema),
        revision: z.number().int().nonnegative()
      })
      .strict()
  )
