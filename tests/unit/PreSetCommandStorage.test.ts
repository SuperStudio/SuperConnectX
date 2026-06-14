import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs'

// Setup test directory for import/export file operations
const TEST_ROOT = path.join(os.tmpdir(), 'superconnectx-preset-test')

function setupTestDir(): void {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true })
  }
  fs.mkdirSync(TEST_ROOT, { recursive: true })
}

function cleanupTestDir(): void {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true })
  }
}

// Since PreSetCommandStorage uses fs.writeFileSync/readFileSync/existsSync directly
// from 'fs', we don't need special mocking - it uses the real fs
// and we just use a temp directory.

describe('PreSetCommandStorage', () => {
  let cmdStorage: any
  let groupStorage: any

  beforeEach(async () => {
    setupTestDir()
    vi.resetModules()

    const PreSetCmdMod = await import('../../src/main/storage/PreSetCommandStorage')
    const GroupMod = await import('../../src/main/storage/CommandGroupStorage')
    cmdStorage = new PreSetCmdMod.default()
    groupStorage = new GroupMod.default()
  })

  afterEach(() => {
    cleanupTestDir()
  })

  describe('add', () => {
    it('添加新命令', () => {
      const cmd = cmdStorage.add({
        name: 'TestCmd',
        command: 'AT+CSQ',
        delay: 100,
        seqNum: 1,
        groupId: 0
      })
      expect(cmd).not.toBe('')
      expect(cmd.id).toBe(1)
      expect(cmd.name).toBe('TestCmd')
      expect(cmd.command).toBe('AT+CSQ')
      expect(cmd.delay).toBe(100)
      expect(cmd.seqNum).toBe(1)
      expect(cmd.groupId).toBe(0)
    })

    it('添加多个命令 ID 递增', () => {
      const c1 = cmdStorage.add({ name: 'C1', command: 'cmd1' })
      const c2 = cmdStorage.add({ name: 'C2', command: 'cmd2' })
      expect(c1.id).toBe(1)
      expect(c2.id).toBe(2)
    })

    it('默认值填充', () => {
      const cmd = cmdStorage.add({})
      expect(cmd.name).toBe('')
      expect(cmd.command).toBe('')
      expect(cmd.delay).toBe(0)
      expect(cmd.seqNum).toBe(1)
      expect(cmd.groupId).toBe(0)
    })

    it('getAll 返回所有命令', () => {
      cmdStorage.add({ name: 'C1', command: 'cmd1' })
      cmdStorage.add({ name: 'C2', command: 'cmd2' })
      const all = cmdStorage.getAll()
      expect(all.length).toBe(2)
    })

    it('add 使用 JSON 序列化去 proxy', () => {
      const cmd = cmdStorage.add({ name: 'Test', command: 'AT', delay: '50', seqNum: '2', groupId: '3' })
      expect(cmd.delay).toBe(50)
      expect(cmd.seqNum).toBe(2)
      expect(cmd.groupId).toBe(3)
    })
  })

  describe('update', () => {
    it('更新已存在的命令', () => {
      const cmd = cmdStorage.add({ name: 'Old', command: 'old' })
      const updated = cmdStorage.update({ id: cmd.id, name: 'New', command: 'new', delay: 200, seqNum: 3, groupId: 1 })
      expect(updated).not.toBe('')
      expect(updated.name).toBe('New')
      expect(updated.command).toBe('new')
      expect(updated.delay).toBe(200)
      expect(updated.seqNum).toBe(3)
    })

    it('更新不存在的命令返回空字符串', () => {
      const result = cmdStorage.update({ id: 999, name: 'Nope' })
      expect(result).toBe('')
    })

    it('更新后 getAll 反映变化', () => {
      const cmd = cmdStorage.add({ name: 'Old', command: 'old' })
      cmdStorage.update({ id: cmd.id, name: 'Updated', command: 'updated' })
      const all = cmdStorage.getAll()
      expect(all[0].name).toBe('Updated')
    })
  })

  describe('delete', () => {
    it('删除已存在的命令', () => {
      const c1 = cmdStorage.add({ name: 'C1', command: 'cmd1' })
      cmdStorage.add({ name: 'C2', command: 'cmd2' })
      const result = cmdStorage.delete(c1.id)
      expect(result.length).toBe(1)
      expect(result[0].name).toBe('C2')
    })

    it('删除不存在的命令不改变数据', () => {
      cmdStorage.add({ name: 'C1', command: 'cmd1' })
      const result = cmdStorage.delete(999)
      expect(result.length).toBe(1)
    })
  })

  describe('deleteByGroupId', () => {
    it('删除指定 groupId 的所有命令', () => {
      cmdStorage.add({ name: 'C1', command: 'cmd1', groupId: 1 })
      cmdStorage.add({ name: 'C2', command: 'cmd2', groupId: 1 })
      cmdStorage.add({ name: 'C3', command: 'cmd3', groupId: 2 })
      const result = cmdStorage.deleteByGroupId(1)
      expect(result.length).toBe(1)
      expect(result[0].name).toBe('C3')
    })

    it('删除不存在的 groupId 不改变数据', () => {
      cmdStorage.add({ name: 'C1', command: 'cmd1', groupId: 1 })
      const result = cmdStorage.deleteByGroupId(999)
      expect(result.length).toBe(1)
    })
  })

  describe('exportCommands', () => {
    it('导出命令和组到文件', () => {
      const group = groupStorage.add({ name: 'G1', connectionType: 'telnet' })
      cmdStorage.add({ name: 'C1', command: 'cmd1', groupId: group!.groupId })
      cmdStorage.add({ name: 'C2', command: 'cmd2', groupId: group!.groupId })

      const filePath = path.join(TEST_ROOT, 'export.json')
      const result = cmdStorage.exportCommands(groupStorage, filePath)

      expect(result.success).toBe(true)
      expect(result.count).toBe(2)
      expect(fs.existsSync(filePath)).toBe(true)

      // Verify file content
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      expect(content.version).toBe(1)
      expect(content.groups.length).toBe(1)
      expect(content.commands.length).toBe(2)
      expect(content.commands[0].name).toBe('C1')
    })

    it('导出空命令列表', () => {
      const filePath = path.join(TEST_ROOT, 'empty-export.json')
      const result = cmdStorage.exportCommands(groupStorage, filePath)

      expect(result.success).toBe(true)
      expect(result.count).toBe(0)
      expect(fs.existsSync(filePath)).toBe(true)

      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      expect(content.commands).toEqual([])
    })
  })

  describe('importCommands', () => {
    it('导入命令文件', () => {
      // First export something to import
      const group = groupStorage.add({ name: 'G1', connectionType: 'telnet' })
      cmdStorage.add({ name: 'C1', command: 'cmd1', groupId: group!.groupId })

      const filePath = path.join(TEST_ROOT, 'to-import.json')
      cmdStorage.exportCommands(groupStorage, filePath)

      // Clear storage
      cmdStorage.deleteByGroupId(group!.groupId)
      expect(cmdStorage.getAll().length).toBe(0)

      // Import
      const result = cmdStorage.importCommands(groupStorage, filePath)
      expect(result.success).toBe(true)
      expect(result.imported).toBe(1)
    })

    it('导入不存在的文件返回失败', () => {
      const result = cmdStorage.importCommands(groupStorage, path.join(TEST_ROOT, 'nonexistent.json'))
      expect(result.success).toBe(false)
      expect(result.message).toContain('not exists')
    })

    it('导入格式无效的文件返回失败', () => {
      const filePath = path.join(TEST_ROOT, 'invalid.json')
      fs.writeFileSync(filePath, JSON.stringify({ foo: 'bar' }), 'utf8')
      const result = cmdStorage.importCommands(groupStorage, filePath)
      expect(result.success).toBe(false)
      expect(result.message).toContain('not have')
    })
  })

  describe('importFromSuperCom', () => {
    it('导入不存在的文件返回失败', () => {
      const result = cmdStorage.importFromSuperCom(groupStorage, path.join(TEST_ROOT, 'nonexistent.json'))
      expect(result.success).toBe(false)
      expect(result.message).toContain('not exists')
    })

    it('导入 SuperCom 格式文件', () => {
      const superComData = {
        advanced_send: [
          {
            ProjectName: 'TestProject',
            Commands: JSON.stringify([
              { Name: 'Cmd1', Command: 'AT+CSQ', Delay: 100, Order: 0 },
              { Name: 'Cmd2', Command: 'AT+GSN', Delay: 200, Order: 1 }
            ])
          }
        ],
        highlight_rule: []
      }

      const filePath = path.join(TEST_ROOT, 'supercom.json')
      fs.writeFileSync(filePath, JSON.stringify(superComData), 'utf8')

      const result = cmdStorage.importFromSuperCom(groupStorage, filePath)
      expect(result.success).toBe(true)
      expect(result.imported).toBe(2)
      expect(result.groups).toBe(1)
    })

    it('导入带 BOM 的 SuperCom 文件', () => {
      const superComData = {
        advanced_send: [
          {
            ProjectName: 'BOMProject',
            Commands: JSON.stringify([
              { Name: 'Cmd1', Command: 'AT', Delay: 0, Order: 0 }
            ])
          }
        ],
        highlight_rule: []
      }

      const filePath = path.join(TEST_ROOT, 'supercom-bom.json')
      // Write with BOM
      const content = JSON.stringify(superComData)
      const bomBuffer = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(content, 'utf8')])
      // Actually UTF-8 BOM is 0xEF 0xBB 0xBF
      const bomUtf8 = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(content, 'utf8')])
      fs.writeFileSync(filePath, bomUtf8)

      const result = cmdStorage.importFromSuperCom(groupStorage, filePath)
      expect(result.success).toBe(true)
      expect(result.imported).toBe(1)
    })

    it('导入带语法高亮规则的 SuperCom 文件', async () => {
      const SettingsStorageModule = await import('../../src/main/storage/SettingsStorage')
      const settingsStorage = new SettingsStorageModule.default()

      const superComData = {
        advanced_send: [
          {
            ProjectName: 'SyntaxProject',
            Commands: JSON.stringify([
              { Name: 'Cmd1', Command: 'AT', Delay: 0, Order: 0 }
            ])
          }
        ],
        highlight_rule: [
          {
            RuleName: 'ErrorRule',
            RuleSetString: JSON.stringify([
              { RuleValue: 'ERROR', RuleType: 1, Foreground: '#FF0000', Bold: true, Italic: false }
            ]),
            PreviewText: 'ERROR: test'
          }
        ]
      }

      const filePath = path.join(TEST_ROOT, 'supercom-syntax.json')
      fs.writeFileSync(filePath, JSON.stringify(superComData), 'utf8')

      const result = cmdStorage.importFromSuperCom(groupStorage, filePath, settingsStorage)
      expect(result.success).toBe(true)
      expect(result.imported).toBe(1)
      expect(result.syntaxImported).toBe(1)
    })

    it('导入没有 advanced_send 的文件', () => {
      const superComData = { highlight_rule: [] }
      const filePath = path.join(TEST_ROOT, 'supercom-no-cmd.json')
      fs.writeFileSync(filePath, JSON.stringify(superComData), 'utf8')

      const result = cmdStorage.importFromSuperCom(groupStorage, filePath)
      expect(result.success).toBe(true)
      expect(result.imported).toBe(0)
    })

    it('导入带无效 Commands JSON 的 SuperCom 文件', () => {
      const superComData = {
        advanced_send: [
          {
            ProjectName: 'BadProject',
            Commands: 'not valid json'
          }
        ]
      }
      const filePath = path.join(TEST_ROOT, 'supercom-bad.json')
      fs.writeFileSync(filePath, JSON.stringify(superComData), 'utf8')

      const result = cmdStorage.importFromSuperCom(groupStorage, filePath)
      expect(result.success).toBe(true)
      expect(result.imported).toBe(0)
    })
  })

  describe('边界情况', () => {
    it('空存储 getAll 返回空数组', () => {
      expect(cmdStorage.getAll()).toEqual([])
    })
  })
})
