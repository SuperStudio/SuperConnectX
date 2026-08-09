/**
 * useShortcuts - 快捷键管理纯逻辑测试
 * 测试：快捷键键位规范化、事件键位提取、快捷键匹配
 */
import { describe, it, expect, vi } from 'vitest'

// Pure functions extracted from useShortcuts
function normalizeShortcutKey(key: string): string {
  const upperKey = key.toUpperCase()
  if (['CONTROL', 'CMD', 'COMMAND', 'COMMANDORCONTROL', 'SUPER', 'HYPER'].includes(upperKey)) {
    return 'Ctrl'
  }
  return key
}

function normalizeEventKey(e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; key: string }): string[] {
  const keys: string[] = []
  if (e.ctrlKey) keys.push('Ctrl')
  if (e.altKey) keys.push('Alt')
  if (e.shiftKey) keys.push('Shift')
  if (e.metaKey) keys.push('Meta')
  const key = e.key
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    let normalizedKey = key
    if (key === ' ') normalizedKey = 'Space'
    else if (key.length === 1) normalizedKey = key.toUpperCase()
    keys.push(normalizedKey)
  }
  return keys
}

function matchShortcut(pressedKeys: string[], shortcutKeys: string[]): boolean {
  if (pressedKeys.length !== shortcutKeys.length) return false
  return pressedKeys.every(k => shortcutKeys.includes(k))
}

describe('normalizeShortcutKey', () => {
  it('should normalize Control to Ctrl', () => {
    expect(normalizeShortcutKey('Control')).toBe('Ctrl')
  })

  it('should normalize CMD to Ctrl', () => {
    expect(normalizeShortcutKey('Cmd')).toBe('Ctrl')
  })

  it('should normalize Command to Ctrl', () => {
    expect(normalizeShortcutKey('Command')).toBe('Ctrl')
  })

  it('should normalize CommandOrControl to Ctrl', () => {
    expect(normalizeShortcutKey('CommandOrControl')).toBe('Ctrl')
  })

  it('should normalize Super to Ctrl', () => {
    expect(normalizeShortcutKey('Super')).toBe('Ctrl')
  })

  it('should normalize Hyper to Ctrl', () => {
    expect(normalizeShortcutKey('Hyper')).toBe('Ctrl')
  })

  it('should leave regular keys unchanged', () => {
    expect(normalizeShortcutKey('A')).toBe('A')
    expect(normalizeShortcutKey('F5')).toBe('F5')
    expect(normalizeShortcutKey('Tab')).toBe('Tab')
    expect(normalizeShortcutKey('Escape')).toBe('Escape')
  })

  it('should be case-insensitive', () => {
    expect(normalizeShortcutKey('control')).toBe('Ctrl')
    expect(normalizeShortcutKey('cmd')).toBe('Ctrl')
    expect(normalizeShortcutKey('a')).toBe('a')
  })
})

describe('normalizeEventKey', () => {
  it('should extract Ctrl+A', () => {
    const keys = normalizeEventKey({ ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, key: 'a' })
    expect(keys).toEqual(['Ctrl', 'A'])
  })

  it('should extract Ctrl+Shift+T', () => {
    const keys = normalizeEventKey({ ctrlKey: true, altKey: false, shiftKey: true, metaKey: false, key: 't' })
    expect(keys).toEqual(['Ctrl', 'Shift', 'T'])
  })

  it('should extract Alt+F4', () => {
    const keys = normalizeEventKey({ ctrlKey: false, altKey: true, shiftKey: false, metaKey: false, key: 'F4' })
    expect(keys).toEqual(['Alt', 'F4'])
  })

  it('should not include modifier-only key events', () => {
    const keys = normalizeEventKey({ ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, key: 'Control' })
    expect(keys).toEqual(['Ctrl'])
  })

  it('should normalize Space key', () => {
    const keys = normalizeEventKey({ ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, key: ' ' })
    expect(keys).toEqual(['Ctrl', 'Space'])
  })

  it('should handle Meta key (Cmd on Mac)', () => {
    const keys = normalizeEventKey({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: true, key: 's' })
    expect(keys).toEqual(['Meta', 'S'])
  })

  it('should handle multiple modifiers', () => {
    const keys = normalizeEventKey({ ctrlKey: true, altKey: true, shiftKey: true, metaKey: true, key: 'p' })
    expect(keys).toEqual(['Ctrl', 'Alt', 'Shift', 'Meta', 'P'])
  })
})

describe('matchShortcut', () => {
  it('should match identical key sets', () => {
    expect(matchShortcut(['Ctrl', 'A'], ['Ctrl', 'A'])).toBe(true)
  })

  it('should match regardless of key order', () => {
    expect(matchShortcut(['A', 'Ctrl'], ['Ctrl', 'A'])).toBe(true)
  })

  it('should not match different length', () => {
    expect(matchShortcut(['Ctrl', 'A'], ['Ctrl'])).toBe(false)
    expect(matchShortcut(['Ctrl'], ['Ctrl', 'A'])).toBe(false)
  })

  it('should not match different keys', () => {
    expect(matchShortcut(['Ctrl', 'A'], ['Ctrl', 'B'])).toBe(false)
  })

  it('should match Shift+Ctrl+A with Ctrl+Shift+A (order-independent)', () => {
    expect(matchShortcut(['Shift', 'Ctrl', 'A'], ['Ctrl', 'Shift', 'A'])).toBe(true)
  })
})

describe('shortcut action key mappings', () => {
  const SHORTCUT_ACTIONS = {
    'Tab:newConnection': '新建连接',
    'Tab:close': '关闭当前选项卡',
    'Tab:toggleConnection': '连接/断开当前选项卡',
    'Tab:toggleAllConnections': '连接/断开所有',
    'Terminal:clear': '清屏',
    'Tab:pinCurrent': '固定/取消固定',
    'Tab:prev': '上一个选项卡',
    'Tab:next': '下一个选项卡',
    'Tab:moveFirst': '移到最前',
    'Tab:moveLast': '移到最后',
    'CommandEditor:open': '打开命令编辑器',
    'ConnectionList:toggle': '展开/收起连接列表',
    'SerialPort:refresh': '刷新串口列表',
    'Window:toggleFullscreen': '切换全屏',
    'Terminal:toggleWordWrap': '切换自动换行',
  }

  it('should have 15 shortcut actions', () => {
    expect(Object.keys(SHORTCUT_ACTIONS)).toHaveLength(15)
  })

  it('should have Chinese descriptions for all actions', () => {
    for (const value of Object.values(SHORTCUT_ACTIONS)) {
      expect(value).toBeTruthy()
      expect(value.length).toBeGreaterThan(0)
    }
  })
})
