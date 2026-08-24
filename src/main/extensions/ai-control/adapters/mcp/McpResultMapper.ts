import * as z from 'zod/v4'
import { asAiOperationError } from '../../application/AiErrors'
import { AiOperationError } from '../../application/AiErrors'

const MAX_RESULT_BYTES = 1024 * 1024

/**
 * MCP Client 会根据 tools/list 中公布的 outputSchema 校验 structuredContent，
 * 包括 isError=true 的结果。所有 Tool 因此都必须把统一失败结构纳入公开契约，
 * 不能只登记各自的成功结果 schema。
 */
const mcpFailureDataSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        retryable: z.boolean(),
        details: z.record(z.string(), z.unknown()).optional()
      })
      .strict()
  })
  .strict()

export const mcpFailureOutputSchema = z.object({ data: mcpFailureDataSchema }).strict()

export function mcpAdvertisedOutputSchema(
  successSchema: z.ZodType<Record<string, unknown>>
): z.ZodType<Record<string, unknown>> {
  // MCP SDK 只会把根 ZodObject 转换成 tools/list.outputSchema；根级 union
  // 会丢失 schema。所有 Registry 输出都遵循 { data: success }，因此只在
  // data 字段内部建立 success/error union，保持根对象兼容 MCP SDK。
  if (!(successSchema instanceof z.ZodObject) || !successSchema.shape.data)
    throw new Error('MCP success output schema must be a { data: ... } ZodObject')
  return z
    .object({
      data: z.union([successSchema.shape.data, mcpFailureDataSchema])
    })
    .strict()
}

interface McpResultBase {
  [key: string]: unknown
  isError?: boolean
  content: Array<{ type: 'text'; text: string }>
}

export interface McpSuccessResult extends McpResultBase {
  structuredContent: { data: unknown }
}

export interface McpFailureResult extends McpResultBase {
  isError: true
  structuredContent: {
    data: {
      error: {
        code: string
        message: string
        retryable: boolean
        details?: Record<string, unknown>
      }
    }
  }
}

export type McpMappedResult = McpSuccessResult | McpFailureResult

export default class McpResultMapper {
  success(value: unknown): McpMappedResult {
    const structuredContent = { data: value }
    const text = JSON.stringify(structuredContent)
    if (Buffer.byteLength(text, 'utf8') > MAX_RESULT_BYTES)
      return this.failure(new AiOperationError('RESULT_TOO_LARGE', 'Tool result exceeds 1 MiB'))
    return {
      content: [
        { type: 'text' as const, text: text.length > 4_096 ? `${text.slice(0, 4_096)}…` : text }
      ],
      structuredContent
    }
  }

  failure(error: unknown): McpFailureResult {
    const mapped = asAiOperationError(error)
    const structuredContent = {
      data: {
        error: {
          code: mapped.code,
          message: mapped.message,
          retryable: mapped.retryable,
          ...(mapped.details ? { details: mapped.details } : {})
        }
      }
    }
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `${mapped.code}: ${mapped.message}` }],
      structuredContent
    }
  }
}
