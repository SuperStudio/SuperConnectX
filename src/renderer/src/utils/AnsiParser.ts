// ===== ANSI SGR 颜色解析 =====

// 只匹配 CSI SGR 序列 (\e[...m)
export const ANSI_SGR_REGEX = /\u001b\[([\d;]*)m/g

/** ANSI 3-bit 标准色映射 */
export const ANSI_FG_COLORS: Record<number, string> = {
  30: '#0C0C0C', 31: '#C50F1F', 32: '#13A10E', 33: '#C19C00',
  34: '#0037DA', 35: '#881798', 36: '#3A96DD', 37: '#CCCCCC'
}

/** ANSI 亮色映射 (90-97) */
export const ANSI_FG_BRIGHT: Record<number, string> = {
  90: '#767676', 91: '#E74856', 92: '#16C60C', 93: '#F9F1A5',
  94: '#3B78FF', 95: '#B4009E', 96: '#61D6D6', 97: '#F2F2F2'
}

/** ANSI 背景色映射 */
export const ANSI_BG_COLORS: Record<number, string> = {
  40: '#0C0C0C', 41: '#C50F1F', 42: '#13A10E', 43: '#C19C00',
  44: '#0037DA', 45: '#881798', 46: '#3A96DD', 47: '#CCCCCC'
}

export const ANSI_BG_BRIGHT: Record<number, string> = {
  100: '#767676', 101: '#E74856', 102: '#16C60C', 103: '#F9F1A5',
  104: '#3B78FF', 105: '#B4009E', 106: '#61D6D6', 107: '#F2F2F2'
}

export interface AnsiStyleState {
  fg: string | null
  bg: string | null
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean
}

export function makeDefaultState(): AnsiStyleState {
  return { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false }
}

export function cloneState(s: AnsiStyleState): AnsiStyleState {
  return { fg: s.fg, bg: s.bg, bold: s.bold, dim: s.dim, italic: s.italic, underline: s.underline }
}

export function isDefaultState(s: AnsiStyleState): boolean {
  return !s.fg && !s.bg && !s.bold && !s.dim && !s.italic && !s.underline
}

/** 获取 256 色 */
function get256Color(code: number): string {
  if (code < 16) {
    return ANSI_FG_COLORS[code + 30] ?? ANSI_FG_BRIGHT[code + 90] ?? '#CCCCCC'
  }
  if (code < 232) {
    const idx = code - 16
    const r = Math.floor(idx / 36) * 51
    const g = Math.floor((idx % 36) / 6) * 51
    const b = (idx % 6) * 51
    return `rgb(${r},${g},${b})`
  }
  const gray = (code - 232) * 10 + 8
  return `rgb(${gray},${gray},${gray})`
}

/** 应用 SGR 参数到状态对象 */
function applySgr(params: number[], state: AnsiStyleState): void {
  for (let i = 0; i < params.length; i++) {
    const p = params[i]
    if (p === 0) { Object.assign(state, makeDefaultState()) }
    else if (p === 1) { state.bold = true; state.dim = false }
    else if (p === 2) { state.dim = true; state.bold = false }
    else if (p === 3) { state.italic = true }
    else if (p === 4) { state.underline = true }
    else if (p === 22) { state.bold = false; state.dim = false }
    else if (p === 23) { state.italic = false }
    else if (p === 24) { state.underline = false }
    else if (p >= 30 && p <= 37) { state.fg = ANSI_FG_COLORS[p] }
    else if (p === 38) {
      if (params[i + 1] === 5 && i + 2 < params.length) {
        state.fg = get256Color(params[i + 2]); i += 2
      } else if (params[i + 1] === 2 && i + 4 < params.length) {
        state.fg = `rgb(${params[i + 2]},${params[i + 3]},${params[i + 4]})`; i += 4
      }
    }
    else if (p === 39) { state.fg = null }
    else if (p >= 40 && p <= 47) { state.bg = ANSI_BG_COLORS[p] }
    else if (p === 48) {
      if (params[i + 1] === 5 && i + 2 < params.length) {
        state.bg = get256Color(params[i + 2]); i += 2
      } else if (params[i + 1] === 2 && i + 4 < params.length) {
        state.bg = `rgb(${params[i + 2]},${params[i + 3]},${params[i + 4]})`; i += 4
      }
    }
    else if (p === 49) { state.bg = null }
    else if (p >= 90 && p <= 97) { state.fg = ANSI_FG_BRIGHT[p] }
    else if (p >= 100 && p <= 107) { state.bg = ANSI_BG_BRIGHT[p] }
  }
}

export interface AnsiSegment {
  start: number
  end: number
  style: AnsiStyleState
}

export interface AnsiParseResult {
  cleanText: string
  segments: AnsiSegment[]
}

/**
 * 解析文本中的 ANSI SGR 序列，返回纯文本 + 样式段信息
 *
 * 两步法：
 * 1. 扫描原始文本，记录每个 cleanText 位置对应的样式状态
 * 2. 将连续的相同样式位置压缩为 segments
 */
export function parseAnsiToSegments(text: string): AnsiParseResult {
  // 防御性去除 \r（回车符），避免其干扰 Monaco 的偏移计算
  // Monaco 内部将 \r\n 归一化为 \n，但孤立的 \r 会导致位置偏移
  text = text.replace(/\r/g, '')

  // 快速路径：无 ANSI 序列
  if (text.indexOf('\u001b') === -1 && text.indexOf('\u009b') === -1) {
    return { cleanText: text, segments: [] }
  }

  // 第一步：扫描并构建 (cleanOffset → styleState) 映射
  const styleAtOffset: Map<number, AnsiStyleState> = new Map()
  let cleanText = ''
  let cleanLen = 0
  let state = makeDefaultState()

  const regex = new RegExp(ANSI_SGR_REGEX.source, 'g')
  let lastRawIdx = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const escStart = match.index
    const escEnd = regex.lastIndex
    const paramStr = match[1]

    // 转义序列之前的纯文本
    if (escStart > lastRawIdx) {
      const plain = text.slice(lastRawIdx, escStart)
      // 为这段纯文本的每个位置记录当前样式
      if (!isDefaultState(state)) {
        for (let j = 0; j < plain.length; j++) {
          styleAtOffset.set(cleanLen + j, cloneState(state))
        }
      }
      cleanText += plain
      cleanLen += plain.length
    }

    // 应用 SGR 参数
    const params = paramStr ? paramStr.split(';').map(Number) : [0]
    applySgr(params, state)

    lastRawIdx = escEnd
  }

  // 末尾剩余纯文本
  if (lastRawIdx < text.length) {
    const plain = text.slice(lastRawIdx)
    if (!isDefaultState(state)) {
      for (let j = 0; j < plain.length; j++) {
        styleAtOffset.set(cleanLen + j, cloneState(state))
      }
    }
    cleanText += plain
    cleanLen += plain.length
  }

  // 第二步：压缩连续相同样式的位置为 segments
  const segments: AnsiSegment[] = []
  const sortedOffsets = Array.from(styleAtOffset.keys()).sort((a, b) => a - b)

  let segStart = -1
  let segEnd = -1
  let segStyle: AnsiStyleState | null = null
  let segStyleKey = ''

  for (const offset of sortedOffsets) {
    const curStyle = styleAtOffset.get(offset)!
    const curKey = `${curStyle.fg}|${curStyle.bg}|${curStyle.bold}|${curStyle.dim}|${curStyle.italic}|${curStyle.underline}`

    if (segStart === -1) {
      // 开始第一个 segment
      segStart = offset
      segEnd = offset + 1
      segStyle = curStyle
      segStyleKey = curKey
    } else if (offset === segEnd && curKey === segStyleKey) {
      // 连续且样式相同，扩展当前 segment
      segEnd = offset + 1
    } else {
      // 不连续或样式变化，闭合上一个，开始新的
      if (segStyle && segStart < segEnd) {
        segments.push({ start: segStart, end: segEnd, style: segStyle })
      }
      segStart = offset
      segEnd = offset + 1
      segStyle = curStyle
      segStyleKey = curKey
    }
  }

  // 闭合最后一个 segment
  if (segStyle && segStart < segEnd) {
    segments.push({ start: segStart, end: segEnd, style: segStyle })
  }

  return { cleanText, segments }
}
