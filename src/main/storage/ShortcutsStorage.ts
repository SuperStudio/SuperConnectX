import BaseStorage from './BaseStorage'

interface ShortcutItem {
  action: string
  keys: string[]
}

// 快捷键命令映射
export const SHORTCUT_ACTIONS: Record<string, string> = {
  'Tab:newConnection': '新建连接',
  'Tab:close': '关闭当前标签',
  'Tab:toggleConnection': '打开/断开当前连接',
  'Tab:toggleAllConnections': '打开/断开全部连接',
  'Terminal:clear': '清空终端',
  'Tab:pinCurrent': '固定/取消固定标签',
  'Tab:prev': '切换到上一个标签',
  'Tab:next': '切换到下一个标签',
  'Tab:moveFirst': '标签移到最前',
  'Tab:moveLast': '标签移到后',
  'CommandEditor:open': '打开命令编辑器',
  'ConnectionList:toggle': '显示/隐藏连接列表',
  'SerialPort:refresh': '刷新串口列表',
}

const STORAGE_NAME = 'shortcuts'

export default class ShortcutsStorage extends BaseStorage<ShortcutItem> {
  constructor() {
    super(STORAGE_NAME, [])
  }

  // 获取所有快捷键
  getAll(): ShortcutItem[] {
    const data = this.storageData.get(STORAGE_NAME)
    if (Array.isArray(data) && data.length > 0) {
      // 获取默认的 action 列表
      const defaultActions = this.getDefaultShortcuts().map(s => s.action)
      // 过滤，只保留默认的 action
      const filtered = data.filter(item => defaultActions.includes(item.action))
      // 合并默认快捷键，确保每个默认 action 都有对应的数据
      return this.getDefaultShortcuts().map(defaultItem => {
        const saved = filtered.find(item => item.action === defaultItem.action)
        return saved || defaultItem
      })
    }
    // 返回默认快捷键
    return this.getDefaultShortcuts()
  }

  // 保存所有快捷键
  saveAll(data: ShortcutItem[]): void {
    this.storageData.set(STORAGE_NAME, data)
  }

  // 获取默认快捷键（公开方法，用于恢复默认设置）
  getDefaults(): ShortcutItem[] {
    return this.getDefaultShortcuts()
  }

  // 获取默认快捷键
  private getDefaultShortcuts(): ShortcutItem[] {
    return [
      { action: 'Tab:newConnection', keys: ['Ctrl', 'N'] },
      { action: 'Tab:close', keys: ['Ctrl', 'W'] },
      { action: 'Tab:toggleConnection', keys: ['Ctrl', 'D'] },
      { action: 'Tab:toggleAllConnections', keys: ['Ctrl', 'Shift', 'D'] },
      { action: 'Terminal:clear', keys: ['Ctrl', 'Shift', 'C'] },
      { action: 'Tab:pinCurrent', keys: ['Ctrl', 'E'] },
      { action: 'Tab:prev', keys: ['Ctrl', 'Tab'] },
      { action: 'Tab:next', keys: ['Ctrl', 'Shift', 'Tab'] },
      { action: 'Tab:moveFirst', keys: ['Ctrl', 'Shift', 'Q'] },
      { action: 'Tab:moveLast', keys: ['Ctrl', 'Shift', 'W'] },
      { action: 'CommandEditor:open', keys: ['Ctrl', 'Shift', 'E'] },
      { action: 'ConnectionList:toggle', keys: ['Ctrl', 'B'] },
      { action: 'SerialPort:refresh', keys: ['Ctrl', 'F5'] },
    ]
  }
}
