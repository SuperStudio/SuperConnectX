import BaseStorage from './BaseStorage'
import logger from '../ipc/IpcAppLogger'
import CommandGroupStorage from './CommandGroupStorage'
import fs from 'fs'

const STORAGE_NAME = 'commands'

export default class PreSetCommandStorage extends BaseStorage {
  constructor() {
    super(STORAGE_NAME, {
      commands: []
    })
  }

  add(cmd) {
    try {
      const pureCmd = JSON.parse(JSON.stringify(cmd))
      const commands = this.getAll()
      const newId = commands.length ? Math.max(...commands.map((c) => Number(c.id) || 0)) + 1 : 1
      const newCmd = {
        id: newId,
        name: pureCmd.name || '',
        command: pureCmd.command || '',
        delay: Number(pureCmd.delay) || 0,
        groupId: Number(pureCmd.groupId) || 0
      }

      commands.push(newCmd)
      this.saveAll(commands)
      logger.info(`add preset command ${JSON.stringify(newCmd)}`)
      return newCmd
    } catch (error) {
      logger.error(`add preset command error: ${error}`)
    }
    return ''
  }

  update(cmd) {
    try {
      const pureCmd = JSON.parse(JSON.stringify(cmd))
      const commands = this.getAll()
      const index = commands.findIndex((c) => c.id === Number(pureCmd.id))

      if (index !== -1) {
        commands[index] = {
          id: Number(pureCmd.id),
          name: pureCmd.name || '',
          command: pureCmd.command || '',
          delay: Number(pureCmd.delay) || 0,
          groupId: Number(pureCmd.groupId) || 0
        }
        this.saveAll(commands)
        logger.info(`update preset command: ${JSON.stringify(commands[index])}`)
        return commands[index]
      }
    } catch (error) {
      logger.error(`update preset command error: ${error}`)
    }
    return ''
  }

  delete(id) {
    const commands = this.getAll()
    const newCommands = commands.filter((c) => c.id !== id)
    const deleteCmd = commands.filter((c) => c.id === id)
    this.saveAll(newCommands)
    logger.info(`delete preset command: ${JSON.stringify(deleteCmd?.[0])}`)
    return newCommands
  }

  deleteByGroupId(groupId: number) {
    try {
      const commands = this.getAll()
      const newCommands = commands.filter((c) => c.groupId !== groupId)
      this.saveAll(newCommands)
      return newCommands
    } catch (error) {
      logger.error(`deleteByGroupId error: ${error}`)
      return this.getAll()
    }
  }

  // 导出命令
  exportCommands(commandGroupStorage: CommandGroupStorage, filePath: string) {
    try {
      const commands = this.getAll()
      const groups = commandGroupStorage.getAll()
      const exportData = {
        version: 1,
        exportTime: new Date().toISOString(),
        groups: groups,
        commands: commands
      }

      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf8')
      return { success: true, count: commands.length }
    } catch (error) {
      logger.error(`export commands error: ${error}`)
      return { success: false, message: error.message }
    }
  }

  // 导入命令
  importCommands(commandGroupStorage: CommandGroupStorage, filePath: string) {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, message: 'file not exists' }
      }

      const content = fs.readFileSync(filePath, 'utf8')
      const importData = JSON.parse(content)

      if (!importData.groups || !importData.commands) {
        return { success: false, message: 'not have groups or commands' }
      }

      const existingGroups = commandGroupStorage.getAll()
      let importedCount = 0
      let skippedCount = 0

      // 先导入组（如果不存在）
      importData.groups.forEach((group) => {
        const existing = existingGroups.find(
          (g) => g.name === group.name && g.connectionType === group.connectionType
        )

        if (!existing) {
          commandGroupStorage.add({
            name: group.name,
            connectionType: group.connectionType
          })
        }
      })

      // 刷新组数据
      const updatedGroups = commandGroupStorage.getAll()
      const existingCommands = this.getAll()

      // 导入命令
      importData.commands.forEach((cmd) => {
        // 查找对应的组
        const targetGroup = updatedGroups.find(
          (g) =>
            g.name === importData.groups.find((gr) => gr.groupId === cmd.groupId)?.name &&
            g.connectionType ===
              importData.groups.find((gr) => gr.groupId === cmd.groupId)?.connectionType
        )

        if (!targetGroup) {
          skippedCount++
          return
        }

        // 检查命令是否已存在（同名同组）
        const commandExists = existingCommands.some(
          (c) =>
            c.name === cmd.name && c.groupId === targetGroup.groupId && c.command === cmd.command
        )

        if (commandExists) {
          skippedCount++
          return
        }

        // 添加新命令
        this.add({
          name: cmd.name,
          command: cmd.command,
          delay: cmd.delay,
          groupId: targetGroup.groupId
        })

        importedCount++
      })

      return {
        success: true,
        imported: importedCount,
        skipped: skippedCount
      }
    } catch (error) {
      logger.error(`import commands error: ${error}`)
      return { success: false, message: error }
    }
  }
}
