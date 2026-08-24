import * as z from 'zod/v4'
import AiLogReader from '../../infrastructure/AiLogReader'
import { AiOperationError } from '../AiErrors'
import { AI_ERROR_CODES } from '../AiErrorCodes'
import type { AiOperationDefinition } from '../AiOperationRegistry'
import { dataOutputSchema, operation } from '../AiOperationRegistry'

const tailOutputSchema = dataOutputSchema(
  z
    .object({
      sessionId: z.string(),
      content: z.string(),
      lineCount: z.number().int().nonnegative(),
      returnedBytes: z.number().int().nonnegative(),
      fileSize: z.number().int().nonnegative(),
      startOffset: z.number().int().nonnegative(),
      nextOffset: z.number().int().nonnegative(),
      truncatedBefore: z.boolean()
    })
    .strict()
)

const searchOutputSchema = dataOutputSchema(
  z
    .object({
      sessionId: z.string(),
      query: z.string(),
      matches: z.array(
        z
          .object({ line: z.string(), before: z.array(z.string()), after: z.array(z.string()) })
          .strict()
      ),
      matchCount: z.number().int().nonnegative(),
      returnedBytes: z.number().int().nonnegative(),
      scannedBytes: z.number().int().nonnegative(),
      fromOffset: z.number().int().nonnegative(),
      nextOffset: z.number().int().nonnegative(),
      fileSize: z.number().int().nonnegative(),
      endReached: z.boolean(),
      truncatedBefore: z.boolean()
    })
    .strict()
)

async function mapLogError<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch {
    throw new AiOperationError(
      AI_ERROR_CODES.LOG_READ_FAILED,
      'The requested session log is unavailable or could not be read.'
    )
  }
}

export function createLogHandlers(logs: AiLogReader): AiOperationDefinition[] {
  return [
    operation({
      name: 'log_read_tail',
      description: 'Read a bounded tail of a session log.',
      capabilityGroup: 'auditRead',
      access: 'read',
      inputSchema: z
        .object({
          sessionId: z.string().min(1),
          maxBytes: z
            .number()
            .int()
            .min(1024)
            .max(64 * 1024)
            .default(32 * 1024),
          maxLines: z.number().int().min(1).max(1000).default(200)
        })
        .strict(),
      outputSchema: tailOutputSchema,
      errorCodes: [AI_ERROR_CODES.LOG_READ_FAILED],
      handler: async (input) =>
        mapLogError(() =>
          logs.readTail(String(input.sessionId), {
            maxBytes: Number(input.maxBytes),
            maxLines: Number(input.maxLines)
          })
        )
    }),
    operation({
      name: 'log_search',
      description: 'Search a bounded region of a session log.',
      capabilityGroup: 'auditRead',
      access: 'read',
      inputSchema: z
        .object({
          sessionId: z.string().min(1),
          query: z.string().min(1).max(256),
          fromOffset: z.number().int().nonnegative().optional(),
          maxScanBytes: z
            .number()
            .int()
            .min(64 * 1024)
            .max(2 * 1024 * 1024)
            .default(512 * 1024),
          maxMatches: z.number().int().min(1).max(100).default(50),
          contextLines: z.number().int().min(0).max(5).default(2),
          caseSensitive: z.boolean().default(false)
        })
        .strict(),
      outputSchema: searchOutputSchema,
      errorCodes: [AI_ERROR_CODES.LOG_READ_FAILED, AI_ERROR_CODES.INVALID_PARAMS],
      handler: async (input) =>
        mapLogError(() =>
          logs.search(String(input.sessionId), String(input.query), {
            fromOffset: input.fromOffset as number | undefined,
            maxScanBytes: Number(input.maxScanBytes),
            maxMatches: Number(input.maxMatches),
            contextLines: Number(input.contextLines),
            caseSensitive: input.caseSensitive === true
          })
        )
    })
  ]
}
