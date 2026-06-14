import { describe, it, expect, beforeEach } from 'vitest'
import ShortcutsStorage, { SHORTCUT_ACTIONS } from '../../src/main/storage/ShortcutsStorage'

describe('ShortcutsStorage', () => {
  let storage: ShortcutsStorage

  beforeEach(() => {
    storage = new ShortcutsStorage()
  })

  describe('getAll', () => {
    it('返回默认快捷键列表', () => {
      const all = storage.getAll()
      expect(Array.isArray(all)).toBe(true)
      expect(all.length).toBeGreaterThan(0)
    })

    it('每个快捷键都有 action 和 keys', () => {
      const all = storage.getAll()
      for (const item of all) {
        expect(item.action).toBeTruthy()
        expect(Array.isArray(item.keys))
        expect(item.keys.length).toBeGreaterThan(0)
      }
    })

    it('包含所有 SHORTCUT_ACTIONS 中定义的 action', () => {
      const all = storage.getAll()
      const actions = all.map((s) => s.action)
      for (const action of Object.keys(SHORTCUT_ACTIONS)) {
        expect(actions).toContain(action)
      }
    })

    it('合并保存的快捷键和默认快捷键', () => {
      const custom = [
        { action: 'Tab:newConnection', keys: ['Ctrl', 'T'] },
        { action: 'Tab:close', keys: ['Ctrl', 'W'] }
      ]
      storage.saveAll(custom)

      const all = storage.getAll()
      expect(all.length).toBe(Object.keys(SHORTCUT_ACTIONS).length)
      const newConn = all.find((s) => s.action === 'Tab:newConnection')
      expect(newConn!.keys).toEqual(['Ctrl', 'T'])
    })

    it('保存时过滤非法 action', () => {
      const custom = [
        { action: 'Tab:newConnection', keys: ['A'] },
        { action: 'InvalidAction', keys: ['B'] }
      ]
      storage.saveAll(custom)
      const all = storage.getAll()
      const invalid = all.find((s) => s.action === 'InvalidAction')
      expect(invalid).toBeUndefined()
    })
  })

  describe('getDefaults', () => {
    it('返回默认快捷键', () => {
      const defaults = storage.getDefaults()
      expect(defaults.length).toBe(Object.keys(SHORTCUT_ACTIONS).length)
    })
  })

  describe('saveAll', () => {
    it('保存后 getAll 返回保存的数据', () => {
      const data = storage.getDefaults()
      data[0].keys = ['Ctrl', 'Shift', 'X']
      storage.saveAll(data)
      const all = storage.getAll()
      expect(all[0].keys).toEqual(['Ctrl', 'Shift', 'X'])
    })

    it('空数组保存后返回默认值', () => {
      storage.saveAll([])
      const all = storage.getAll()
      expect(all.length).toBe(Object.keys(SHORTCUT_ACTIONS).length)
    })
  })

  describe('SHORTCUT_ACTIONS', () => {
    it('所有 action 都有中文描述', () => {
      const actions = Object.values(SHORTCUT_ACTIONS)
      for (const desc of actions) {
        expect(desc).toBeTruthy()
        expect(typeof desc).toBe('string')
      }
    })

    it('包含 14 个快捷键定义', () => {
      expect(Object.keys(SHORTCUT_ACTIONS).length).toBe(14)
    })
  })
})
