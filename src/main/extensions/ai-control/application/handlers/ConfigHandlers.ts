import * as z from 'zod/v4'
import type { ConfigDomainSchema, ConfigSnapshot } from '../../../../services/types/RuntimeTypes'
import type { ConfigPort } from '../../ports/ConfigPort'
import { AiOperationError } from '../AiErrors'
import { AI_ERROR_CODES } from '../AiErrorCodes'
import type { AiOperationDefinition } from '../AiOperationRegistry'
import { dataOutputSchema, operation } from '../AiOperationRegistry'
import {
  configDomainSchema,
  configSnapshotSchema,
  unknownRecordSchema
} from '../AiOperationSchemas'

const ALLOWED_FIELDS: Record<string, readonly string[]> = {
  settings: [
    'logSplit',
    'logSplitSize',
    'autoScroll',
    'autoScrollToast',
    'autoScrollOnFocus',
    'autoScrollAfterSend',
    'autoScrollOnWheel',
    'maxDisplayText',
    'sendDisplayText',
    'recvDisplayText',
    'supportedBaudRates',
    'showPortType',
    'enableLogStorage',
    'logPath',
    'logFileName',
    'commandHistoryMaxCount',
    'showCommandHistory',
    'clearInputAfterSend'
  ],
  'com-settings': [
    'baudRate',
    'dataBits',
    'stopBits',
    'parity',
    'encoding',
    'readTimeout',
    'writeTimeout',
    'flowControl',
    'rts',
    'dtr',
    'hexDisplayMode',
    'showTimestamp',
    'autoNewline',
    'hexMode',
    'crcEnabled',
    'crcMethod'
  ]
}

function assertDomain(domain: string, patch?: Record<string, unknown>): void {
  const allowed = ALLOWED_FIELDS[domain]
  if (!allowed)
    throw new AiOperationError(
      'CONFIG_SCOPE_DENIED',
      `Configuration domain is not exposed: ${domain}`
    )
  for (const field of Object.keys(patch || {}))
    if (!allowed.includes(field))
      throw new AiOperationError(
        'CONFIG_SCOPE_DENIED',
        `Configuration field is not exposed: ${domain}.${field}`
      )
}

function filterSchema(schema: ConfigDomainSchema): ConfigDomainSchema {
  assertDomain(schema.domain)
  return {
    ...schema,
    fields: schema.fields.filter((field) => ALLOWED_FIELDS[schema.domain].includes(field.path))
  }
}

function filterSnapshot(snapshot: ConfigSnapshot): ConfigSnapshot {
  assertDomain(snapshot.domain)
  return {
    ...snapshot,
    value: snapshot.value
      ? Object.fromEntries(
          Object.entries(snapshot.value).filter(([field]) =>
            ALLOWED_FIELDS[snapshot.domain].includes(field)
          )
        )
      : null
  }
}

export function createConfigHandlers(config: ConfigPort): AiOperationDefinition[] {
  return [
    operation({
      name: 'config_describe',
      description: 'Describe exposed non-AI business configuration fields.',
      capabilityGroup: 'configManage',
      access: 'read',
      inputSchema: z.object({ domain: z.string().optional() }).strict(),
      outputSchema: dataOutputSchema(z.object({ domains: z.array(configDomainSchema) }).strict()),
      errorCodes: [AI_ERROR_CODES.CONFIG_SCOPE_DENIED],
      handler: async (input) => {
        if (input.domain) assertDomain(String(input.domain))
        return {
          domains: config
            .describe(input.domain as string | undefined)
            .filter((schema) => Boolean(ALLOWED_FIELDS[schema.domain]))
            .map(filterSchema)
        }
      }
    }),
    operation({
      name: 'config_get',
      description: 'Read an exposed business configuration snapshot.',
      capabilityGroup: 'configManage',
      access: 'read',
      inputSchema: z
        .object({ domain: z.string(), targetId: z.string().nullable().optional() })
        .strict(),
      outputSchema: dataOutputSchema(configSnapshotSchema),
      errorCodes: [
        AI_ERROR_CODES.CONFIG_SCOPE_DENIED,
        AI_ERROR_CODES.CONFIG_DOMAIN_NOT_FOUND,
        AI_ERROR_CODES.CONFIG_TARGET_REQUIRED
      ],
      handler: async (input) => {
        assertDomain(String(input.domain))
        return filterSnapshot(
          config.get(String(input.domain), input.targetId as string | null | undefined)
        )
      }
    }),
    operation({
      name: 'config_patch',
      description: 'Patch exposed non-AI business configuration.',
      capabilityGroup: 'configManage',
      access: 'write',
      inputSchema: z
        .object({
          domain: z.string(),
          targetId: z.string().nullable().optional(),
          patch: z.record(z.string(), z.unknown()),
          expectedRevision: z.number().int().nonnegative()
        })
        .strict(),
      outputSchema: dataOutputSchema(
        z
          .object({
            success: z.literal(true),
            snapshot: configSnapshotSchema,
            changed: unknownRecordSchema,
            effectiveNow: z.boolean(),
            requiresReconnect: z.boolean(),
            requiresRestart: z.boolean(),
            source: z.enum(['gui', 'ai', 'system'])
          })
          .strict()
      ),
      errorCodes: [
        AI_ERROR_CODES.CONFIG_SCOPE_DENIED,
        AI_ERROR_CODES.CONFIG_CONFLICT,
        AI_ERROR_CODES.CONFIG_INVALID,
        AI_ERROR_CODES.CONFIG_INVALID_PATCH,
        AI_ERROR_CODES.CONFIG_REVISION_CONFLICT,
        AI_ERROR_CODES.CONFIG_BUSY,
        AI_ERROR_CODES.CONFIG_WRITE_FAILED
      ],
      handler: async (input) => {
        const domain = String(input.domain)
        const patch = input.patch as Record<string, unknown>
        assertDomain(domain, patch)
        const result = await config.patch({
          domain,
          targetId: input.targetId as string | null | undefined,
          patch,
          expectedRevision: Number(input.expectedRevision)
        })
        return { ...result, snapshot: filterSnapshot(result.snapshot) }
      }
    })
  ]
}
