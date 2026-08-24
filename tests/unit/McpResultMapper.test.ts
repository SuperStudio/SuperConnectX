import { describe, expect, it } from 'vitest'
import McpResultMapper, {
  mcpAdvertisedOutputSchema
} from '../../src/main/extensions/ai-control/adapters/mcp/McpResultMapper'
import { AiOperationError } from '../../src/main/extensions/ai-control/application/AiErrors'
import * as z from 'zod/v4'

describe('McpResultMapper', () => {
  it('returns structured success and stable error', () => {
    const mapper = new McpResultMapper()
    expect(mapper.success({ ok: true }).structuredContent).toEqual({ data: { ok: true } })
    const failure = mapper.failure(new AiOperationError('AI_READ_ONLY', 'denied'))
    expect(failure.isError).toBe(true)
    expect(failure.structuredContent.data.error.code).toBe('AI_READ_ONLY')
  })

  it('does not expose unexpected internal error messages or paths', () => {
    const mapper = new McpResultMapper()
    const failure = mapper.failure(
      new Error('ENOENT: C:\\Users\\secret-user\\AppData\\private-token.json')
    )
    expect(failure.structuredContent.data.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Internal operation failed. Check the local application log for details.'
    })
    expect(JSON.stringify(failure)).not.toContain('secret-user')
    expect(JSON.stringify(failure)).not.toContain('private-token.json')
  })

  it('advertises one schema that accepts both tool success and stable failure results', () => {
    const mapper = new McpResultMapper()
    const schema = mcpAdvertisedOutputSchema(
      z.object({ data: z.object({ accepted: z.literal(true) }).strict() }).strict()
    )

    expect(schema.safeParse(mapper.success({ accepted: true }).structuredContent).success).toBe(
      true
    )
    expect(
      schema.safeParse(
        mapper.failure(new AiOperationError('CONFIG_SCOPE_DENIED', 'denied')).structuredContent
      ).success
    ).toBe(true)
  })
})
