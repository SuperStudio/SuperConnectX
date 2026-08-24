import * as z from 'zod/v4'
import type { AiExecutionContext } from './AiExecutionContext'
import type { AiCapabilityGroup } from './PolicyService'
import { AI_ERROR_CODES, COMMON_AI_ERROR_CODES, type AiErrorCode } from './AiErrorCodes'

export interface AiToolAnnotations {
  readOnlyHint: boolean
  destructiveHint: boolean
  idempotentHint: boolean
  openWorldHint: boolean
}

export interface AiOperationDefinition {
  name: string
  description: string
  capabilityGroup: AiCapabilityGroup
  access: 'read' | 'write'
  inputSchema: z.ZodType<Record<string, unknown>>
  outputSchema: z.ZodType<Record<string, unknown>>
  annotations: AiToolAnnotations
  deadlineMs: number
  errorCodes: AiErrorCode[]
  handler: (input: Record<string, unknown>, context: AiExecutionContext) => Promise<unknown>
}

export default class AiOperationRegistry {
  private readonly operations = new Map<string, AiOperationDefinition>()

  constructor(definitions: AiOperationDefinition[]) {
    for (const definition of definitions) {
      if (this.operations.has(definition.name))
        throw new Error(`Duplicate AI operation: ${definition.name}`)
      this.operations.set(definition.name, definition)
    }
  }

  list(): AiOperationDefinition[] {
    return [...this.operations.values()]
  }

  get(name: string): AiOperationDefinition | undefined {
    return this.operations.get(name)
  }
}

export function dataOutputSchema<T extends z.ZodType>(schema: T): z.ZodObject<{ data: T }> {
  return z.object({ data: schema }).strict()
}

export function operation(
  definition: Omit<AiOperationDefinition, 'annotations' | 'deadlineMs'> & {
    annotations?: Partial<AiToolAnnotations>
    deadlineMs?: number
  }
): AiOperationDefinition {
  const write = definition.access === 'write'
  return {
    ...definition,
    annotations: {
      readOnlyHint: !write,
      destructiveHint: false,
      idempotentHint: !write,
      openWorldHint: false,
      ...definition.annotations
    },
    deadlineMs: definition.deadlineMs || 10_000,
    errorCodes: Array.from(
      new Set([
        ...COMMON_AI_ERROR_CODES,
        ...(write ? [AI_ERROR_CODES.AI_READ_ONLY] : []),
        ...definition.errorCodes
      ])
    )
  }
}
