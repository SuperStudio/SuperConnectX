import { describe, it, expect, beforeEach } from 'vitest'
import CommandHistoryStorage from '../../src/main/storage/CommandHistoryStorage'
import SettingsStorage from '../../src/main/storage/SettingsStorage'

describe('CommandHistoryStorage', () => {
  let storage: CommandHistoryStorage
  let settings: SettingsStorage

  beforeEach(() => {
    settings = new SettingsStorage()
    storage = new CommandHistoryStorage(settings)
  })

  describe('getHistory', () => {
    it('初始返回空数组', () => {
      const history = storage.getHistory('telnet')
      expect(history).toEqual([])
    })

    it('协议类型大小写不敏感', () => {
      storage.addCommand('TELNET', 'cmd1')
      const history = storage.getHistory('telnet')
      expect(history).toEqual(['cmd1'])
    })
  })

  describe('addCommand', () => {
    it('添加命令到历史', () => {
      storage.addCommand('telnet', 'AT+CSQ')
      const history = storage.getHistory('telnet')
      expect(history).toEqual(['AT+CSQ'])
    })

    it('新命令添加到最前面', () => {
      storage.addCommand('telnet', 'cmd1')
      storage.addCommand('telnet', 'cmd2')
      const history = storage.getHistory('telnet')
      expect(history).toEqual(['cmd2', 'cmd1'])
    })

    it('重复命令移到最前面（去重）', () => {
      storage.addCommand('telnet', 'cmd1')
      storage.addCommand('telnet', 'cmd2')
      storage.addCommand('telnet', 'cmd1')
      const history = storage.getHistory('telnet')
      expect(history).toEqual(['cmd1', 'cmd2'])
    })

    it('空命令不添加', () => {
      storage.addCommand('telnet', '  ')
      const history = storage.getHistory('telnet')
      expect(history).toEqual([])
    })

    it('不同协议类型独立存储', () => {
      storage.addCommand('telnet', 'telnet-cmd')
      storage.addCommand('ssh', 'ssh-cmd')
      expect(storage.getHistory('telnet')).toEqual(['telnet-cmd'])
      expect(storage.getHistory('ssh')).toEqual(['ssh-cmd'])
    })

    it('超出最大数量时裁剪', () => {
      // 默认 maxCount = 10
      for (let i = 0; i < 15; i++) {
        storage.addCommand('telnet', `cmd${i}`)
      }
      const history = storage.getHistory('telnet')
      expect(history.length).toBeLessThanOrEqual(10)
    })
  })

  describe('clearHistory', () => {
    it('清除指定协议历史', () => {
      storage.addCommand('telnet', 'cmd1')
      storage.addCommand('ssh', 'ssh-cmd')
      storage.clearHistory('telnet')
      expect(storage.getHistory('telnet')).toEqual([])
      expect(storage.getHistory('ssh')).toEqual(['ssh-cmd'])
    })
  })

  describe('removeCommand', () => {
    it('移除指定命令', () => {
      storage.addCommand('telnet', 'cmd1')
      storage.addCommand('telnet', 'cmd2')
      storage.removeCommand('telnet', 'cmd1')
      expect(storage.getHistory('telnet')).toEqual(['cmd2'])
    })

    it('移除不存在的命令不报错', () => {
      storage.addCommand('telnet', 'cmd1')
      storage.removeCommand('telnet', 'nonexistent')
      expect(storage.getHistory('telnet')).toEqual(['cmd1'])
    })
  })

  describe('applyMaxCount', () => {
    it('裁剪所有历史到新上限', () => {
      // 添加多个协议的历史
      for (let i = 0; i < 15; i++) {
        storage.addCommand('telnet', `cmd${i}`)
        storage.addCommand('ssh', `ssh${i}`)
      }
      storage.applyMaxCount(5)
      expect(storage.getHistory('telnet').length).toBeLessThanOrEqual(5)
      expect(storage.getHistory('ssh').length).toBeLessThanOrEqual(5)
    })
  })
})
