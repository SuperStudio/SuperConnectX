import Store from 'electron-store' // v3 版本在这里可以正常访问 app 模块

export default class PreSetCommandStorage {
  presetCommandsStore = new Store({
    name: 'presetCommands',
    cwd: 'super-ssh',
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
        delay: Number(pureCmd.delay) || 0 // 确保是数字类型
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
