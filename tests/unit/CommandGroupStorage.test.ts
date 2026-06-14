import { describe, it, expect, beforeEach } from 'vitest'
import CommandGroupStorage from '../../src/main/storage/CommandGroupStorage'

describe('CommandGroupStorage', () => {
  let storage: CommandGroupStorage

  beforeEach(() => {
    storage = new CommandGroupStorage()
  })

  describe('add', () => {
    it('添加新组', () => {
      const group = storage.add({ name: 'TestGroup', connectionType: 'telnet' })
      expect(group).not.toBeNull()
      expect(group!.groupId).toBe(1)
      expect(group!.name).toBe('TestGroup')
      expect(group!.connectionType).toBe('telnet')
    })

    it('添加多个组 ID 递增', () => {
      const g1 = storage.add({ name: 'G1', connectionType: 'telnet' })
      const g2 = storage.add({ name: 'G2', connectionType: 'ssh' })
      expect(g1!.groupId).toBe(1)
      expect(g2!.groupId).toBe(2)
    })

    it('自动 trim 名称', () => {
      const group = storage.add({ name: '  Trimmed  ', connectionType: 'telnet' })
      expect(group!.name).toBe('Trimmed')
    })

    it('getAll 返回所有组', () => {
      storage.add({ name: 'G1', connectionType: 'telnet' })
      storage.add({ name: 'G2', connectionType: 'com' })
      const all = storage.getAll()
      expect(all.length).toBe(2)
    })
  })

  describe('update', () => {
    it('更新已存在的组', () => {
      const g = storage.add({ name: 'Original', connectionType: 'telnet' })
      const updated = storage.update({
        groupId: g!.groupId,
        name: 'Updated',
        connectionType: 'ssh'
      })
      expect(updated).not.toBeNull()
      expect(updated!.name).toBe('Updated')
      expect(updated!.connectionType).toBe('ssh')
    })

    it('更新不存在的组返回 null', () => {
      const result = storage.update({ groupId: 999, name: 'Nope', connectionType: 'telnet' })
      expect(result).toBeNull()
    })

    it('更新后 getAll 反映变化', () => {
      const g = storage.add({ name: 'Old', connectionType: 'telnet' })
      storage.update({ groupId: g!.groupId, name: 'New', connectionType: 'telnet' })
      const all = storage.getAll()
      expect(all[0].name).toBe('New')
    })
  })

  describe('delete', () => {
    it('删除已存在的组', () => {
      storage.add({ name: 'G1', connectionType: 'telnet' })
      const g2 = storage.add({ name: 'G2', connectionType: 'telnet' })
      const result = storage.delete(g2!.groupId)
      expect(result.length).toBe(1)
      expect(result[0].name).toBe('G1')
    })

    it('删除不存在的组不改变数据', () => {
      storage.add({ name: 'G1', connectionType: 'telnet' })
      const result = storage.delete(999)
      expect(result.length).toBe(1)
    })
  })

  describe('边界情况', () => {
    it('空存储 getAll 返回空数组', () => {
      const all = storage.getAll()
      expect(all).toEqual([])
    })

    it('ID 生成从 1 开始', () => {
      const g = storage.add({ name: 'First', connectionType: 'com' })
      expect(g!.groupId).toBe(1)
    })
  })
})
