import Store from 'electron-store'
import { DEFAULT_STORAGE_DIR } from './StorageConstants'

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
      return newCmd
    } catch (error) {
      console.error('添加预设命令失败:', error)
      return ''
    }
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
        return commands[index]
      }
    } catch (error) {
      console.error('更新预设命令失败:', error)
    }
    return ''
  }

  delete(id) {
    const commands = this.presetCommandsStore.get('commands') as any[]
    const newCommands = commands.filter((c) => c.id !== id)
    this.presetCommandsStore.set('commands', newCommands as never[])
    return newCommands
  }
}
