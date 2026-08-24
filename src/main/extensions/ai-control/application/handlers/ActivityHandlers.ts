import * as z from 'zod/v4'
import type { AuditPort } from '../../ports/AuditPort'
import type { AiOperationDefinition } from '../AiOperationRegistry'
import { dataOutputSchema, operation } from '../AiOperationRegistry'
import { AI_ERROR_CODES } from '../AiErrorCodes'
import { unknownRecordSchema } from '../AiOperationSchemas'

export function createActivityHandlers(audit: AuditPort): AiOperationDefinition[] {
  return [
    operation({
      name: 'activity_read',
      description: 'Read bounded local AI activity history.',
      capabilityGroup: 'auditRead',
      access: 'read',
      inputSchema: z.object({ limit: z.number().int().min(1).max(2000).default(200) }).strict(),
      outputSchema: dataOutputSchema(z.object({ entries: z.array(unknownRecordSchema) }).strict()),
      errorCodes: [AI_ERROR_CODES.LOG_READ_FAILED],
      handler: async (input) => ({ entries: await audit.read(Number(input.limit)) })
    })
  ]
}
