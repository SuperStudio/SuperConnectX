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
        seqNum: Number(pureCmd.seqNum) || 1,
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
          seqNum: Number(pureCmd.seqNum) || 1,
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

      logger.info(`exporting ${commands.length} commands, ${groups.length} groups to ${filePath}`)
      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf8')
      logger.info(`export success: ${commands.length} commands saved`)
      return { success: true, count: commands.length }
    } catch (error) {
      const err = error as Error
      logger.error(`export commands error: ${err.message}`)
      return { success: false, message: err.message }
    }
  }

  // 导入命令
  importCommands(commandGroupStorage: CommandGroupStorage, filePath: string) {
    try {
      if (!fs.existsSync(filePath)) {
        logger.warn(`import file not found: ${filePath}`)
        return { success: false, message: 'file not exists' }
      }

      const content = fs.readFileSync(filePath, 'utf8')
      const importData = JSON.parse(content)

      if (!importData.groups || !importData.commands) {
        logger.warn(`import file has invalid format: ${filePath}`)
        return { success: false, message: 'not have groups or commands' }
      }

      logger.info(`importing commands from ${filePath}, groups: ${importData.groups.length}, commands: ${importData.commands.length}`)

      const existingGroups = commandGroupStorage.getAll()
      let importedCount = 0
      let skippedCount = 0
      let createdGroups = 0

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
          createdGroups++
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
          seqNum: cmd.seqNum || 1,
          groupId: targetGroup.groupId
        })

        importedCount++
      })

      logger.info(`import complete: ${importedCount} imported, ${skippedCount} skipped, ${createdGroups} groups created`)
      return {
        success: true,
        imported: importedCount,
        skipped: skippedCount
      }
    } catch (error) {
      const err = error as Error
      logger.error(`import commands error: ${err.message}`)
      return { success: false, message: err.message }
    }
  }

  // 从 SuperCom 配置文件导入（advanced_send 格式 + highlight_rule 语法高亮）
  importFromSuperCom(
    commandGroupStorage: CommandGroupStorage,
    filePath: string,
    settingsStorage?: any
  ) {
    try {
      if (!fs.existsSync(filePath)) {
        logger.warn(`SuperCom import file not found: ${filePath}`)
        return { success: false, message: 'file not exists' }
      }

      const content = fs.readFileSync(filePath, 'utf8')
      // 去除 UTF-8 BOM（部分编辑器保存的 JSON 文件会在开头有 BOM 字符）
      const cleanContent = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
      const superComData = JSON.parse(cleanContent)

      // ========== 1. 导入命令组（advanced_send） ==========
      let importedCount = 0
      let skippedCount = 0
      let createdGroups = 0

      if (superComData.advanced_send && Array.isArray(superComData.advanced_send)) {
        const connectionType = 'com'

        for (const project of superComData.advanced_send) {
          const projectName = project.ProjectName?.trim()
          if (!projectName) {
            logger.warn('SuperCom import: skipping project with no ProjectName')
            continue
          }

          // 解析 Commands 字段（它是 JSON 字符串）
          let commands: any[] = []
          if (project.Commands) {
            try {
              commands = JSON.parse(project.Commands)
            } catch {
              logger.warn(`SuperCom import: failed to parse Commands for project "${projectName}"`)
              continue
            }
          }

          if (!Array.isArray(commands) || commands.length === 0) {
            logger.warn(`SuperCom import: no commands in project "${projectName}"`)
            continue
          }

          // 查找或创建组（按 name + connectionType 匹配）
          const existingGroups = commandGroupStorage.getAll()
          let targetGroup = existingGroups.find(
            (g) => g.name === projectName && g.connectionType === connectionType
          )

          if (!targetGroup) {
            const newGroup = commandGroupStorage.add({
              name: projectName,
              connectionType: connectionType
            })
            if (!newGroup) {
              logger.error(`SuperCom import: failed to create group "${projectName}"`)
              continue
            }
            targetGroup = newGroup
            createdGroups++
          }

          const existingCommands = this.getAll()

          // 按 Order 排序
          commands.sort((a, b) => (a.Order || 0) - (b.Order || 0))

          for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i]
            const cmdName = cmd.Name || `命令${i + 1}`
            const cmdCommand = cmd.Command || ''
            const cmdDelay = Number(cmd.Delay) || 0

            // 检查命令是否已存在（同名同组同命令内容）
            const commandExists = existingCommands.some(
              (c) =>
                c.name === cmdName &&
                c.groupId === targetGroup!.groupId &&
                c.command === cmdCommand
            )

            if (commandExists) {
              skippedCount++
              continue
            }

            this.add({
              name: cmdName,
              command: cmdCommand,
              delay: cmdDelay,
              seqNum: i + 1,
              groupId: targetGroup!.groupId
            })

            importedCount++
          }
        }

        logger.info(`SuperCom import complete: ${importedCount} imported, ${skippedCount} skipped, ${createdGroups} groups created`)
      } else {
        logger.info('SuperCom import: no advanced_send data, skipping command import')
      }

      // ========== 2. 导入语法高亮规则（highlight_rule） ==========
      let syntaxImported = 0
      let syntaxSkipped = 0

      if (settingsStorage && superComData.highlight_rule && Array.isArray(superComData.highlight_rule)) {
        logger.info(`SuperCom import: found ${superComData.highlight_rule.length} highlight_rule entries`)

        const currentSettings = settingsStorage.getSettings()
        const existingSyntaxGroups: any[] = currentSettings.syntaxRuleGroups || []
        let maxGroupId = existingSyntaxGroups.reduce((max: number, g: any) => Math.max(max, g.id || 0), 0)
        let maxRuleId = 0
        existingSyntaxGroups.forEach((g: any) => {
          g.subRules?.forEach((r: any) => { maxRuleId = Math.max(maxRuleId, r.id || 0) })
        })

        for (const hr of superComData.highlight_rule) {
          const groupName = hr.RuleName || `导入规则组 ${syntaxImported + 1}`
          logger.info(`SuperCom import syntax: processing "${groupName}"`)

          // 解析 RuleSetString
          let ruleSetItems: any[] = []
          try {
            let rsStr = hr.RuleSetString || ''
            // SuperCom 的 RuleSetString 是 C# JSON 字符串，内层正则 \\ 在外层解析后变成 \
            // 但 \d \[ 等在严格 JSON 中非法，需要先双转义再还原合法序列
            let fixed = rsStr.replace(/\\/g, '\\\\')
            fixed = fixed
              .replace(/\\\\n/g, '\\n')
              .replace(/\\\\r/g, '\\r')
              .replace(/\\\\t/g, '\\t')
              .replace(/\\\\"/g, '\\"')
              .replace(/\\\\\\\\/g, '\\\\')
            ruleSetItems = JSON.parse(fixed)
            if (!Array.isArray(ruleSetItems)) ruleSetItems = []
          } catch (e) {
            logger.warn(`SuperCom import syntax: failed to parse RuleSetString for "${groupName}": ${String(e)}`)
            syntaxSkipped++
            continue
          }

          if (ruleSetItems.length === 0) {
            logger.warn(`SuperCom import syntax: no rules in "${groupName}"`)
            syntaxSkipped++
            continue
          }

          // 映射子规则：RuleValue 经过 JSON.parse 后已是单反斜杠，直接存储即可
          const subRules: any[] = ruleSetItems.map((item: any) => {
            let foreground = item.Foreground || '#FF4444'
            if (foreground.length === 9 && foreground.startsWith('#')) {
              foreground = '#' + foreground.slice(3)
            }
            const pattern = item.RuleValue || ''
            maxRuleId++
            return {
              id: maxRuleId,
              matchType: item.RuleType === 1 ? 'keyword' : 'regex',
              pattern: pattern,
              caseSensitive: false,
              foreground: foreground,
              background: '',
              bold: item.Bold || false,
              italic: item.Italic || false,
              underline: false
            }
          })

          // 检查是否已存在同名组，存在则覆盖
          const existingIndex = existingSyntaxGroups.findIndex((g: any) => g.name === groupName)
          if (existingIndex >= 0) {
            logger.info(`SuperCom import syntax: overwriting existing group "${groupName}"`)
            existingSyntaxGroups[existingIndex] = {
              ...existingSyntaxGroups[existingIndex],
              subRules,
              previewText: hr.PreviewText || existingSyntaxGroups[existingIndex].previewText || ''
            }
          } else {
            maxGroupId++
            existingSyntaxGroups.push({
              id: maxGroupId,
              name: groupName,
              subRules,
              previewText: hr.PreviewText || ''
            })
          }
          syntaxImported++
        }

        // 保存语法高亮规则
        settingsStorage.saveSettings({ syntaxRuleGroups: existingSyntaxGroups } as any)
        logger.info(`SuperCom import syntax complete: ${syntaxImported} imported, ${syntaxSkipped} skipped`)
      } else if (superComData.highlight_rule) {
        logger.info('SuperCom import: highlight_rule found but settingsStorage not available, skipping')
      }

      return {
        success: true,
        imported: importedCount,
        skipped: skippedCount,
        groups: createdGroups,
        syntaxImported: syntaxImported,
        syntaxSkipped: syntaxSkipped
      }
    } catch (error) {
      const err = error as Error
      logger.error(`SuperCom import error: ${err.message}`)
      return { success: false, message: err.message }
    }
  }
}
