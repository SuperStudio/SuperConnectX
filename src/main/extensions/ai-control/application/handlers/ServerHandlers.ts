import * as z from 'zod/v4'
import type { AiOperationDefinition } from '../AiOperationRegistry'
import { dataOutputSchema, operation } from '../AiOperationRegistry'
import { unknownRecordSchema } from '../AiOperationSchemas'

export function createServerHandlers(
  getInfo: () => Record<string, unknown>
): AiOperationDefinition[] {
  return [
    operation({
      name: 'server_get_info',
      description: 'Get the current SuperConnectX MCP instance and safety state.',
      capabilityGroup: 'sessionRead',
      access: 'read',
      inputSchema: z.object({}).strict(),
      outputSchema: dataOutputSchema(unknownRecordSchema),
      errorCodes: [],
      handler: async () => getInfo()
    })
  ]
}
