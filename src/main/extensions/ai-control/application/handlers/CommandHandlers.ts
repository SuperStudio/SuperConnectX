import * as z from 'zod/v4'
import type { CoreCatalog } from '../../../../services/types/CoreCatalog'
import type { ConfigPort } from '../../ports/ConfigPort'
import { AiOperationError } from '../AiErrors'
import { AI_ERROR_CODES } from '../AiErrorCodes'
import type { AiOperationDefinition } from '../AiOperationRegistry'
import { dataOutputSchema, operation } from '../AiOperationRegistry'
import { revisionedListOutputSchema, unknownRecordSchema } from '../AiOperationSchemas'

const itemOutputSchema = (field: string): z.ZodType<Record<string, unknown>> =>
  dataOutputSchema(
    z
      .object({
        [field]: unknownRecordSchema,
        revision: z.number().int().nonnegative()
      })
      .strict()
  )

function assertRevision(config: ConfigPort, domain: string, expected: number): void {
  const actual = config.get(domain).revision
  if (actual !== expected)
    throw new AiOperationError('CONFIG_CONFLICT', `${domain} revision changed`, true, {
      expectedRevision: expected,
      actualRevision: actual
    })
}

function requireCatalogRecord(value: unknown, action: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AiOperationError(AI_ERROR_CODES.CATALOG_OPERATION_FAILED, `Failed to ${action}`)
  return value as Record<string, unknown>
}

export function createCommandHandlers(
  catalog: CoreCatalog,
  config: ConfigPort
): AiOperationDefinition[] {
  const item = z.record(z.string(), z.unknown())
  return [
    operation({
      name: 'command_group_list',
      description: 'List command groups.',
      capabilityGroup: 'commandManage',
      access: 'read',
      inputSchema: z.object({}).strict(),
      outputSchema: revisionedListOutputSchema('groups'),
      errorCodes: [],
      handler: async () => ({
        groups: catalog.listCommandGroups(),
        revision: config.get('command-groups').revision
      })
    }),
    operation({
      name: 'command_group_create',
      description: 'Create a command group.',
      capabilityGroup: 'commandManage',
      access: 'write',
      inputSchema: z.object({ group: item }).strict(),
      outputSchema: itemOutputSchema('group'),
      errorCodes: [AI_ERROR_CODES.INVALID_PARAMS, AI_ERROR_CODES.CATALOG_OPERATION_FAILED],
      handler: async (input) => {
        const group = input.group as Record<string, unknown>
        if (typeof group.name !== 'string' || !group.name.trim())
          throw new AiOperationError('INVALID_PARAMS', 'group.name is required')
        const created = requireCatalogRecord(
          catalog.createCommandGroup(group),
          'create command group'
        )
        return {
          group: created,
          revision: config.recordExternalChange('command-groups', null, { operation: 'created' })
            .revision
        }
      }
    }),
    operation({
      name: 'command_group_update',
      description: 'Update a command group.',
      capabilityGroup: 'commandManage',
      access: 'write',
      inputSchema: z
        .object({ group: item, expectedRevision: z.number().int().nonnegative() })
        .strict(),
      outputSchema: itemOutputSchema('group'),
      errorCodes: [
        AI_ERROR_CODES.CONFIG_CONFLICT,
        AI_ERROR_CODES.INVALID_PARAMS,
        AI_ERROR_CODES.CATALOG_OPERATION_FAILED
      ],
      handler: async (input) => {
        assertRevision(config, 'command-groups', Number(input.expectedRevision))
        const group = input.group as Record<string, unknown>
        if (!Number.isInteger(group.groupId))
          throw new AiOperationError('INVALID_PARAMS', 'group.groupId is required')
        return {
          group: requireCatalogRecord(catalog.updateCommandGroup(group), 'update command group'),
          revision: config.recordExternalChange('command-groups', null, { operation: 'updated' })
            .revision
        }
      }
    }),
    operation({
      name: 'command_group_delete',
      description: 'Delete a command group and its presets.',
      capabilityGroup: 'commandManage',
      access: 'write',
      annotations: { destructiveHint: true },
      inputSchema: z
        .object({
          groupId: z.number().int().positive(),
          expectedRevision: z.number().int().nonnegative()
        })
        .strict(),
      outputSchema: dataOutputSchema(
        z
          .object({
            groups: z.array(unknownRecordSchema),
            revision: z.number().int().nonnegative(),
            presetRevision: z.number().int().nonnegative()
          })
          .strict()
      ),
      errorCodes: [AI_ERROR_CODES.CONFIG_CONFLICT, AI_ERROR_CODES.CATALOG_OPERATION_FAILED],
      handler: async (input) => {
        assertRevision(config, 'command-groups', Number(input.expectedRevision))
        const groups = catalog.deleteCommandGroup(Number(input.groupId))
        return {
          groups,
          revision: config.recordExternalChange('command-groups', null, { operation: 'deleted' })
            .revision,
          presetRevision: config.recordExternalChange('preset-commands', null, {
            operation: 'deleted-by-group'
          }).revision
        }
      }
    }),
    operation({
      name: 'preset_command_list',
      description: 'List preset commands.',
      capabilityGroup: 'commandManage',
      access: 'read',
      inputSchema: z.object({}).strict(),
      outputSchema: revisionedListOutputSchema('commands'),
      errorCodes: [],
      handler: async () => ({
        commands: catalog.listPresetCommands(),
        revision: config.get('preset-commands').revision
      })
    }),
    operation({
      name: 'preset_command_create',
      description: 'Create a preset command.',
      capabilityGroup: 'commandManage',
      access: 'write',
      inputSchema: z.object({ command: item }).strict(),
      outputSchema: itemOutputSchema('command'),
      errorCodes: [AI_ERROR_CODES.INVALID_PARAMS, AI_ERROR_CODES.CATALOG_OPERATION_FAILED],
      handler: async (input) => {
        const command = input.command as Record<string, unknown>
        if (!Number.isInteger(command.groupId))
          throw new AiOperationError('INVALID_PARAMS', 'command.groupId is required')
        return {
          command: requireCatalogRecord(
            catalog.createPresetCommand(command),
            'create preset command'
          ),
          revision: config.recordExternalChange('preset-commands', null, { operation: 'created' })
            .revision
        }
      }
    }),
    operation({
      name: 'preset_command_update',
      description: 'Update a preset command.',
      capabilityGroup: 'commandManage',
      access: 'write',
      inputSchema: z
        .object({ command: item, expectedRevision: z.number().int().nonnegative() })
        .strict(),
      outputSchema: itemOutputSchema('command'),
      errorCodes: [
        AI_ERROR_CODES.CONFIG_CONFLICT,
        AI_ERROR_CODES.INVALID_PARAMS,
        AI_ERROR_CODES.CATALOG_OPERATION_FAILED
      ],
      handler: async (input) => {
        assertRevision(config, 'preset-commands', Number(input.expectedRevision))
        const command = input.command as Record<string, unknown>
        if (!Number.isInteger(command.id))
          throw new AiOperationError('INVALID_PARAMS', 'command.id is required')
        return {
          command: requireCatalogRecord(
            catalog.updatePresetCommand(command),
            'update preset command'
          ),
          revision: config.recordExternalChange('preset-commands', null, { operation: 'updated' })
            .revision
        }
      }
    }),
    operation({
      name: 'preset_command_delete',
      description: 'Delete a preset command.',
      capabilityGroup: 'commandManage',
      access: 'write',
      annotations: { destructiveHint: true },
      inputSchema: z
        .object({
          commandId: z.number().int().positive(),
          expectedRevision: z.number().int().nonnegative()
        })
        .strict(),
      outputSchema: revisionedListOutputSchema('commands'),
      errorCodes: [AI_ERROR_CODES.CONFIG_CONFLICT, AI_ERROR_CODES.CATALOG_OPERATION_FAILED],
      handler: async (input) => {
        assertRevision(config, 'preset-commands', Number(input.expectedRevision))
        return {
          commands: catalog.deletePresetCommand(Number(input.commandId)),
          revision: config.recordExternalChange('preset-commands', null, { operation: 'deleted' })
            .revision
        }
      }
    })
  ]
}
