import BaseStorage from './BaseStorage'

interface ShortcutItem {
  action: string
  keys: string[]
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

  // 获取默认快捷键
  private getDefaultShortcuts(): ShortcutItem[] {
    return [
      { action: '新建连接', keys: ['Ctrl', 'N'] },
      { action: '关闭当前标签', keys: ['Ctrl', 'W'] },
      { action: '打开/断开当前连接', keys: ['Ctrl', 'D'] },
      { action: '打开/断开全部连接', keys: ['Ctrl', 'Shift', 'D'] },
      { action: '清空终端', keys: ['Ctrl', 'Shift', 'C'] },
      { action: '固定/取消固定标签', keys: ['Ctrl', 'E'] },
      { action: '切换到上一个标签', keys: ['Ctrl', 'Tab'] },
      { action: '切换到下一个标签', keys: ['Ctrl', 'Shift', 'Tab'] },
      { action: '标签移到最前', keys: ['Ctrl', 'Shift', 'Q'] },
      { action: '标签移到后', keys: ['Ctrl', 'Shift', 'W'] },
    ]
  }
}
