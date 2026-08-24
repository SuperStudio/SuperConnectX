import * as z from 'zod/v4'
import type { SerialPortCatalog } from '../../ports/SerialPortCatalog'
import type { AiOperationDefinition } from '../AiOperationRegistry'
import { dataOutputSchema, operation } from '../AiOperationRegistry'

export function createSerialHandlers(serial: SerialPortCatalog): AiOperationDefinition[] {
  return [
    operation({
      name: 'serial_list_ports',
      description: 'List currently available serial ports.',
      capabilityGroup: 'sessionRead',
      access: 'read',
      inputSchema: z.object({}).strict(),
      outputSchema: dataOutputSchema(
        z
          .object({
            ports: z.array(
              z
                .object({
                  path: z.string(),
                  displayName: z.string().optional(),
                  manufacturer: z.string().optional(),
                  serialNumber: z.string().optional(),
                  vendorId: z.string().optional(),
                  productId: z.string().optional()
                })
                .strict()
            )
          })
          .strict()
      ),
      errorCodes: [],
      handler: async () => ({ ports: await serial.list() })
    })
  ]
}
