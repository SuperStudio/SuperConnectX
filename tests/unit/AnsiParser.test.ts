import { describe, it, expect } from 'vitest'
import {
  parseAnsiToSegments,
  makeDefaultState,
  cloneState,
  isDefaultState,
  ANSI_FG_COLORS,
  ANSI_FG_BRIGHT,
  ANSI_BG_COLORS,
  ANSI_BG_BRIGHT
} from '../../src/renderer/src/utils/AnsiParser'

describe('AnsiParser', () => {
  describe('makeDefaultState', () => {
    it('返回所有属性为默认值的状态', () => {
      const state = makeDefaultState()
      expect(state.fg).toBeNull()
      expect(state.bg).toBeNull()
      expect(state.bold).toBe(false)
      expect(state.dim).toBe(false)
      expect(state.italic).toBe(false)
      expect(state.underline).toBe(false)
    })
  })

  describe('cloneState', () => {
    it('深拷贝状态对象', () => {
      const s = makeDefaultState()
      s.fg = '#FF0000'
      s.bold = true
      const cloned = cloneState(s)
      expect(cloned.fg).toBe('#FF0000')
      expect(cloned.bold).toBe(true)
      // 修改 clone 不影响原始
      cloned.fg = '#00FF00'
      expect(s.fg).toBe('#FF0000')
    })
  })

  describe('isDefaultState', () => {
    it('默认状态返回 true', () => {
      expect(isDefaultState(makeDefaultState())).toBe(true)
    })

    it('有前景色时返回 false', () => {
      const s = makeDefaultState()
      s.fg = '#FF0000'
      expect(isDefaultState(s)).toBe(false)
    })

    it('有背景色时返回 false', () => {
      const s = makeDefaultState()
      s.bg = '#00FF00'
      expect(isDefaultState(s)).toBe(false)
    })

    it('bold 时返回 false', () => {
      const s = makeDefaultState()
      s.bold = true
      expect(isDefaultState(s)).toBe(false)
    })
  })

  describe('颜色映射表', () => {
    it('ANSI_FG_COLORS 有 8 个条目 (30-37)', () => {
      const keys = Object.keys(ANSI_FG_COLORS).map(Number)
      expect(keys.length).toBe(8)
      for (let i = 30; i <= 37; i++) {
        expect(ANSI_FG_COLORS[i]).toBeDefined()
      }
    })

    it('ANSI_FG_BRIGHT 有 8 个条目 (90-97)', () => {
      for (let i = 90; i <= 97; i++) {
        expect(ANSI_FG_BRIGHT[i]).toBeDefined()
      }
    })

    it('ANSI_BG_COLORS 有 8 个条目 (40-47)', () => {
      for (let i = 40; i <= 47; i++) {
        expect(ANSI_BG_COLORS[i]).toBeDefined()
      }
    })

    it('ANSI_BG_BRIGHT 有 8 个条目 (100-107)', () => {
      for (let i = 100; i <= 107; i++) {
        expect(ANSI_BG_BRIGHT[i]).toBeDefined()
      }
    })
  })

  describe('parseAnsiToSegments - 无 ANSI 序列', () => {
    it('纯文本直接返回', () => {
      const result = parseAnsiToSegments('Hello World')
      expect(result.cleanText).toBe('Hello World')
      expect(result.segments.length).toBe(0)
    })

    it('空字符串', () => {
      const result = parseAnsiToSegments('')
      expect(result.cleanText).toBe('')
      expect(result.segments.length).toBe(0)
    })

    it('去除 \\r', () => {
      const result = parseAnsiToSegments('line1\r\nline2\r\n')
      expect(result.cleanText).toBe('line1\nline2\n')
    })
  })

  describe('parseAnsiToSegments - 基本 SGR', () => {
    it('前景色 31 (红色)', () => {
      // \e[31m RED \e[0m
      const text = '\u001b[31mRED\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('RED')
      expect(result.segments.length).toBe(1)
      expect(result.segments[0].start).toBe(0)
      expect(result.segments[0].end).toBe(3)
      expect(result.segments[0].style.fg).toBe(ANSI_FG_COLORS[31])
    })

    it('粗体 (bold=1)', () => {
      const text = '\u001b[1mBOLD\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('BOLD')
      expect(result.segments.length).toBe(1)
      expect(result.segments[0].style.bold).toBe(true)
      expect(result.segments[0].style.dim).toBe(false)
    })

    it('dim (2) 与 bold 互斥', () => {
      const text = '\u001b[2mDIM\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('DIM')
      expect(result.segments.length).toBe(1)
      expect(result.segments[0].style.dim).toBe(true)
      expect(result.segments[0].style.bold).toBe(false)
    })

    it('italic (3)', () => {
      const text = '\u001b[3mITALIC\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('ITALIC')
      expect(result.segments.length).toBe(1)
      expect(result.segments[0].style.italic).toBe(true)
    })

    it('underline (4)', () => {
      const text = '\u001b[4mUNDERLINE\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('UNDERLINE')
      expect(result.segments.length).toBe(1)
      expect(result.segments[0].style.underline).toBe(true)
    })

    it('reset 后的文本无样式', () => {
      const text = '\u001b[31mRED\u001b[0mNORMAL'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('REDNORMAL')
      // RED 有样式，NORMAL 没有
      expect(result.segments.length).toBe(1)
      expect(result.segments[0].start).toBe(0)
      expect(result.segments[0].end).toBe(3)
    })
  })

  describe('parseAnsiToSegments - 复合样式', () => {
    it('多个参数同时应用', () => {
      // \e[1;31m BOLD RED \e[0m
      const text = '\u001b[1;31mBOLD RED\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('BOLD RED')
      expect(result.segments.length).toBe(1)
      expect(result.segments[0].style.bold).toBe(true)
      expect(result.segments[0].style.fg).toBe(ANSI_FG_COLORS[31])
    })

    it('前景色 + 背景色', () => {
      // \e[31;42m FG RED BG GREEN \e[0m
      const text = '\u001b[31;42mCOLORED\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('COLORED')
      expect(result.segments.length).toBe(1)
      expect(result.segments[0].style.fg).toBe(ANSI_FG_COLORS[31])
      expect(result.segments[0].style.bg).toBe(ANSI_BG_COLORS[42])
    })
  })

  describe('parseAnsiToSegments - 亮色', () => {
    it('亮前景色 90-97', () => {
      const text = '\u001b[91mBRIGHT RED\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('BRIGHT RED')
      expect(result.segments[0].style.fg).toBe(ANSI_FG_BRIGHT[91])
    })

    it('亮背景色 100-107', () => {
      const text = '\u001b[101mBRIGHT BG\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('BRIGHT BG')
      expect(result.segments[0].style.bg).toBe(ANSI_BG_BRIGHT[101])
    })
  })

  describe('parseAnsiToSegments - 256 色 (38;5)', () => {
    it('256 色前景', () => {
      // \e[38;5;196m RED \e[0m
      const text = '\u001b[38;5;196mRED256\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('RED256')
      expect(result.segments.length).toBe(1)
      expect(result.segments[0].style.fg).toMatch(/^rgb\(/)
    })

    it('256 色背景', () => {
      // \e[48;5;21m BLUE BG \e[0m
      const text = '\u001b[48;5;21mBLUE BG\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('BLUE BG')
      expect(result.segments[0].style.bg).toMatch(/^rgb\(/)
    })

    it('灰度 (232-255)', () => {
      const text = '\u001b[38;5;240mGRAY\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('GRAY')
      const fg = result.segments[0].style.fg!
      // 灰度范围 rgb(x,x,x) 其中 x 在 8-238
      expect(fg).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
    })
  })

  describe('parseAnsiToSegments - 24-bit RGB (38;2)', () => {
    it('RGB 前景色', () => {
      // \e[38;2;255;128;0m ORANGE \e[0m
      const text = '\u001b[38;2;255;128;0mORANGE\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('ORANGE')
      expect(result.segments[0].style.fg).toBe('rgb(255,128,0)')
    })

    it('RGB 背景色', () => {
      // \e[48;2;0;128;255m BLUE BG \e[0m
      const text = '\u001b[48;2;0;128;255mBLUE\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('BLUE')
      expect(result.segments[0].style.bg).toBe('rgb(0,128,255)')
    })
  })

  describe('parseAnsiToSegments - 段合并', () => {
    it('连续相同样式合并为一个 segment', () => {
      const text = '\u001b[31mAAAA\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.segments.length).toBe(1)
      expect(result.segments[0].start).toBe(0)
      expect(result.segments[0].end).toBe(4)
    })

    it('不同样式产生多个 segments', () => {
      const text = '\u001b[31mRED\u001b[0m\u001b[34mBLUE\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('REDBLUE')
      expect(result.segments.length).toBe(2)
      expect(result.segments[0].style.fg).toBe(ANSI_FG_COLORS[31])
      expect(result.segments[1].style.fg).toBe(ANSI_FG_COLORS[34])
    })

    it('不连续的样式变化', () => {
      // 两个字符有样式，中间无样式
      const text = '\u001b[31mR\u001b[0mE\u001b[31mD\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('RED')
      expect(result.segments.length).toBe(2)
      expect(result.segments[0].start).toBe(0)
      expect(result.segments[0].end).toBe(1) // 'R'
      expect(result.segments[1].start).toBe(2)
      expect(result.segments[1].end).toBe(3) // 'D'
    })
  })

  describe('parseAnsiToSegments - 边界情况', () => {
    it('空 SGR 参数 (等同于 0)', () => {
      const text = '\u001b[mRESET\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('RESET')
      expect(result.segments.length).toBe(0) // reset 后无样式
    })

    it('仅含 ANSI 序列无文本', () => {
      const text = '\u001b[31m\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('')
      expect(result.segments.length).toBe(0)
    })

    it('恢复默认前景色 (39)', () => {
      const text = '\u001b[31mR\u001b[39mE\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('RE')
      // R 有红色，E 无前景色
      expect(result.segments[0].style.fg).toBe(ANSI_FG_COLORS[31])
    })

    it('恢复默认背景色 (49)', () => {
      const text = '\u001b[42mGREEN BG\u001b[49mNO BG\u001b[0m'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('GREEN BGNO BG')
      // 第一个 segment 有背景色
      expect(result.segments[0].style.bg).toBe(ANSI_BG_COLORS[42])
    })
  })

  describe('parseAnsiToSegments - \\r 处理', () => {
    it('去除孤立的 \\r', () => {
      const text = 'Hello\rWorld'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('HelloWorld')
    })

    it('\\r\\n 变为 \\n', () => {
      const text = 'Line1\r\nLine2'
      const result = parseAnsiToSegments(text)
      expect(result.cleanText).toBe('Line1\nLine2')
    })
  })
})
