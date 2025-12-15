import BaseStorage from './BaseStorage'
import logger from '../ipc/IpcAppLogger'

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
}
