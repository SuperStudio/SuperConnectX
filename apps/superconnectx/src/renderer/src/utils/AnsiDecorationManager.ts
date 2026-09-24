import * as monaco from 'monaco-editor'
import type { AnsiSegment } from './AnsiParser'

/**
 * 将 cleanText 内的字符偏移转换为 Monaco Position
 * 从 basePos 出发逐字符扫描 \n 计算行号/列号，绕过 Windows \r\n offset 差异。
 */
export function offsetInTextToMonacoPos(
  basePos: monaco.Position,
  text: string,
  charOffset: number
): monaco.Position | null {
  if (charOffset <= 0) return basePos
  if (charOffset > text.length) return null

  let lineNum = basePos.lineNumber
  let col = basePos.column
  for (let i = 0; i < charOffset; i++) {
    if (text[i] === '\n') { lineNum++; col = 1 } else { col++ }
  }
  return new monaco.Position(lineNum, col)
}

/**
 * ANSI 装饰器管理器
 * 负责将 ANSI 样式段转换为 Monaco decorations，并管理 CSS 注入/清理生命周期
 */
export class AnsiDecorationManager {
  private editor: monaco.editor.IStandaloneCodeEditor | null = null
  private model: monaco.editor.ITextModel | null = null

  private decorationIds: string[] = []
  private classCounter = 0
  private classMap = new Map<string, string>()
  private instanceId: string

  constructor() {
    this.instanceId = `ansi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  /** 绑定 Monaco Editor 实例 */
  bind(editor: monaco.editor.IStandaloneCodeEditor, model: monaco.editor.ITextModel): void {
    this.editor = editor
    this.model = model
  }

  /** 解绑并清理 */
  unbind(): void {
    this.clearDecorations()
    this.removeStyles()
    this.editor = null
    this.model = null
  }

  /**
   * 应用 ANSI 颜色装饰器
   * @param segments - parseAnsiToSegments 返回的样式段数组（偏移量相对于本次新增文本）
   * @param insertOffset - 本次 append 前文档中插入位置的全局 offset
   * @param cleanText - 本次追加的纯文本（不含 ANSI 序列）
   */
  apply(
    segments: AnsiSegment[],
    insertOffset: number,
    cleanText: string
  ): void {
    const editor = this.editor
    const model = this.model
    if (!editor || !model || segments.length === 0) return

    // 获取插入基准位置 (line, column) —— Monaco 坐标系统，天然准确
    const basePos = model.getPositionAt(insertOffset)
    const newDecorations: monaco.editor.IModelDeltaDecoration[] = []
    let styleContent = ''

    for (const seg of segments) {
      const startPos = offsetInTextToMonacoPos(basePos, cleanText, seg.start)
      const endPos = offsetInTextToMonacoPos(basePos, cleanText, seg.end)
      if (!startPos || !endPos) continue

      const s = seg.style
      const styleKey = `${s.fg}|${s.bg}|${s.bold}|${s.dim}|${s.italic}|${s.underline}`
      let className = this.classMap.get(styleKey)
      if (!className) {
        className = `ansi-hl-${this.classCounter++}`
        this.classMap.set(styleKey, className)

        const cssParts: string[] = []
        if (s.fg) cssParts.push(`color: ${s.fg} !important`)
        if (s.bg) cssParts.push(`background-color: ${s.bg} !important`)
        if (s.bold) cssParts.push('font-weight: bold !important')
        if (s.dim) cssParts.push('opacity: 0.6 !important')
        if (s.italic) cssParts.push('font-style: italic !important')
        if (s.underline) cssParts.push('text-decoration: underline !important')

        if (cssParts.length > 0) {
          styleContent += `.${className} { ${cssParts.join('; ')} }\n`
        }
      }

      newDecorations.push({
        range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
        options: { inlineClassName: className }
      })
    }

    // 注入 CSS（只追加不删除）
    if (styleContent) {
      const styleEl = document.createElement('style')
      styleEl.setAttribute('data-ansi-instance', this.instanceId)
      styleEl.textContent = styleContent
      document.head.appendChild(styleEl)
    }

    // 增量添加 decoration（不移除旧的）
    if (newDecorations.length > 0) {
      const newIds = editor.deltaDecorations([], newDecorations)
      this.decorationIds.push(...newIds)
    }
  }

  /** 清除所有 decorations 并重置状态 */
  clearDecorations(): void {
    const editor = this.editor
    if (editor && this.decorationIds.length > 0) {
      this.decorationIds = editor.deltaDecorations(this.decorationIds, [])
    }
  }

  /** 清除所有 decorations + CSS 样式 + 状态（用于 clearTerminal） */
  reset(): void {
    this.clearDecorations()
    this.removeStyles()
    this.classMap.clear()
    this.classCounter = 0
  }

  /** 移除注入的 CSS 样式 */
  removeStyles(): void {
    const oldStyles = document.querySelectorAll(`style[data-ansi-instance="${this.instanceId}"]`)
    oldStyles.forEach(s => s.remove())
  }
}
