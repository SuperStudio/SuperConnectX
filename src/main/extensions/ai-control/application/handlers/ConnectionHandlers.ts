import * as z from 'zod/v4'
import type { CoreCatalog } from '../../../../services/types/CoreCatalog'
import type { ConfigPort } from '../../ports/ConfigPort'
import { AiOperationError } from '../AiErrors'
import { AI_ERROR_CODES } from '../AiErrorCodes'
import type { AiOperationDefinition } from '../AiOperationRegistry'
import { dataOutputSchema, operation } from '../AiOperationRegistry'
import { revisionedListOutputSchema, unknownRecordSchema } from '../AiOperationSchemas'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertRevision(config: ConfigPort, expected: number): void {
  const actual = config.get('connections').revision
  if (actual !== expected)
    throw new AiOperationError('CONFIG_CONFLICT', 'Connections revision changed', true, {
      expectedRevision: expected,
      actualRevision: actual
    })
}

function validateConnection(
  value: Record<string, unknown>,
  requireId = false
): Record<string, unknown> {
  if (requireId && (!Number.isInteger(value.id) || Number(value.id) <= 0))
    throw new AiOperationError('INVALID_PARAMS', 'connection.id must be a positive integer')
  if (typeof value.name !== 'string' || !value.name.trim())
    throw new AiOperationError('INVALID_PARAMS', 'connection.name is required')
  if (value.connectionType !== 'telnet' && value.connectionType !== 'ftp')
    throw new AiOperationError(
      'CONNECTION_TYPE_NOT_EXPOSED',
      'Only Telnet and FTP saved profiles are writable'
    )
  return value
}

export function createConnectionHandlers(
  catalog: CoreCatalog,
  config: ConfigPort
): AiOperationDefinition[] {
  const connection = z.record(z.string(), z.unknown())
  return [
    operation({
      name: 'connection_list',
      description: 'List saved connection profiles.',
      capabilityGroup: 'connectionManage',
      access: 'read',
      inputSchema: z.object({}).strict(),
      outputSchema: revisionedListOutputSchema('connections'),
      errorCodes: [],
      handler: async () => ({
        connections: catalog.listConnections(),
        revision: config.get('connections').revision
      })
    }),
    operation({
      name: 'connection_create',
      description: 'Create a Telnet or FTP profile.',
      capabilityGroup: 'connectionManage',
      access: 'write',
      inputSchema: z.object({ connection }).strict(),
      outputSchema: dataOutputSchema(
        z
          .object({
            connection: unknownRecordSchema,
            revision: z.number().int().nonnegative()
          })
          .strict()
      ),
      errorCodes: [
        AI_ERROR_CODES.INVALID_PARAMS,
        AI_ERROR_CODES.CONNECTION_TYPE_NOT_EXPOSED,
        AI_ERROR_CODES.CATALOG_OPERATION_FAILED
      ],
      handler: async (input) => {
        const created = catalog.createConnection(
          validateConnection(input.connection as Record<string, unknown>)
        )
        if (!isRecord(created))
          throw new AiOperationError('CATALOG_OPERATION_FAILED', 'Failed to create connection')
        return {
          connection: created,
          revision: config.recordExternalChange('connections', null, { operation: 'created' })
            .revision
        }
      }
    }),
    operation({
      name: 'connection_update',
      description: 'Update a saved Telnet or FTP profile.',
      capabilityGroup: 'connectionManage',
      access: 'write',
      inputSchema: z
        .object({ connection, expectedRevision: z.number().int().nonnegative() })
        .strict(),
      outputSchema: dataOutputSchema(
        z
          .object({
            connection: unknownRecordSchema,
            revision: z.number().int().nonnegative()
          })
          .strict()
      ),
      errorCodes: [
        AI_ERROR_CODES.CONFIG_CONFLICT,
        AI_ERROR_CODES.INVALID_PARAMS,
        AI_ERROR_CODES.CONNECTION_TYPE_NOT_EXPOSED,
        AI_ERROR_CODES.CATALOG_OPERATION_FAILED
      ],
      handler: async (input) => {
        assertRevision(config, Number(input.expectedRevision))
        const rawUpdated = catalog.updateConnection(
          validateConnection(input.connection as Record<string, unknown>, true)
        )
        const updated = Array.isArray(rawUpdated) ? rawUpdated[0] : rawUpdated
        if (!isRecord(updated))
          throw new AiOperationError('CATALOG_OPERATION_FAILED', 'Failed to update connection')
        return {
          connection: updated,
          revision: config.recordExternalChange('connections', null, { operation: 'updated' })
            .revision
        }
      }
    }),
    operation({
      name: 'connection_delete',
      description: 'Delete a saved connection profile.',
      capabilityGroup: 'connectionManage',
      access: 'write',
      annotations: { destructiveHint: true },
      inputSchema: z
        .object({
          connectionId: z.number().int().positive(),
          expectedRevision: z.number().int().nonnegative()
        })
        .strict(),
      outputSchema: revisionedListOutputSchema('connections'),
      errorCodes: [AI_ERROR_CODES.CONFIG_CONFLICT, AI_ERROR_CODES.CATALOG_ITEM_NOT_FOUND],
      handler: async (input) => {
        assertRevision(config, Number(input.expectedRevision))
        const id = Number(input.connectionId)
        if (
          !catalog
            .listConnections()
            .some(
              (item) =>
                item &&
                typeof item === 'object' &&
                Number((item as Record<string, unknown>).id) === id
            )
        )
          throw new AiOperationError('CATALOG_ITEM_NOT_FOUND', `Connection not found: ${id}`)
        return {
          connections: catalog.deleteConnection(id),
          revision: config.recordExternalChange('connections', null, { operation: 'deleted' })
            .revision
        }
      }
    })
  ]
}
