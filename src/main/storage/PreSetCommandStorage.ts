import Store from 'electron-store'
import { DEFAULT_STORAGE_DIR } from './StorageConstants'
import logger from '../ipc/IpcAppLogger'

export default class PreSetCommandStorage {
  private presetCommandsStore = new Store({
    name: 'presetCommands',
    cwd: DEFAULT_STORAGE_DIR,
    defaults: {
      commands: []
    }
  })
  constructor() {}

  getAll = () => this.presetCommandsStore.get('commands')

  add(cmd) {
    try {
      const pureCmd = JSON.parse(JSON.stringify(cmd))
      const commands = this.presetCommandsStore.get('commands', []) as any[]
      const newId = commands.length ? Math.max(...commands.map((c) => Number(c.id) || 0)) + 1 : 1
      const newCmd = {
        id: newId,
        name: pureCmd.name || '',
        command: pureCmd.command || '',
        delay: Number(pureCmd.delay) || 0
      }

      commands.push(newCmd)
      this.presetCommandsStore.set('commands', commands)
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
      const commands = this.presetCommandsStore.get('commands', []) as any[]
      const index = commands.findIndex((c) => c.id === Number(pureCmd.id))

      if (index !== -1) {
        commands[index] = {
          id: Number(pureCmd.id),
          name: pureCmd.name || '',
          command: pureCmd.command || '',
          delay: Number(pureCmd.delay) || 0
        }
        this.presetCommandsStore.set('commands', commands)
        logger.info(`update preset command: ${JSON.stringify(commands[index])}`)
        return commands[index]
      }
    } catch (error) {
      logger.error(`update preset command error: ${error}`)
    }
    return ''
  }

  delete(id) {
    const commands = this.presetCommandsStore.get('commands') as any[]
    const newCommands = commands.filter((c) => c.id !== id)
    const deleteCmd = commands.filter((c) => c.id === id)
    this.presetCommandsStore.set('commands', newCommands as never[])
    logger.error(`delete preset command: ${JSON.stringify(deleteCmd?.[0])}`)
    return newCommands
  }
}
