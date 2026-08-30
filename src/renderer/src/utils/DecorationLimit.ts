/**
 * 单个终端、单层高亮最多保留的 Monaco decoration 数量。
 * 超出后只移除最旧的颜色高亮，日志文本仍然保留。
 */
export const MAX_TERMINAL_DECORATIONS = 20_000

export function takeDecorationOverflow(ids: string[], limit = MAX_TERMINAL_DECORATIONS): string[] {
  const overflowCount = ids.length - Math.max(0, limit)
  return overflowCount > 0 ? ids.splice(0, overflowCount) : []
}
