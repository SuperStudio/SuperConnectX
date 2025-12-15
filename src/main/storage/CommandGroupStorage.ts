import BaseStorage from './BaseStorage'
import logger from '../ipc/IpcAppLogger'

const STORAGE_NAME = 'cmdGroups'

export default class CommandGroupStorage extends BaseStorage {
  constructor() {
    super(STORAGE_NAME, {
      groups: []
    })
  }

  add(group: { name: string; connectionType: string }) {
    try {
      const groups = this.getAll()
      const newId = groups.length ? Math.max(...groups.map((g) => g.groupId)) + 1 : 1
      const newGroup = {
        groupId: newId,
        name: group.name.trim(),
        connectionType: group.connectionType
      }
      groups.push(newGroup)
      this.saveAll(groups)
      return newGroup
    } catch (error) {
      logger.error(`add group error: ${error}`)
      return null
    }
  }

  update(group: { groupId: number; name: string; connectionType: string }) {
    try {
      const groups = this.getAll()
      const index = groups.findIndex((g) => g.groupId === group.groupId)
      if (index === -1) return null
      groups[index] = {
        groupId: group.groupId,
        name: group.name.trim(),
        connectionType: group.connectionType
      }
      this.saveAll(groups)
      return groups[index]
    } catch (error) {
      logger.error(`update group error: ${error}`)
      return null
    }
  }

  delete(groupId: number) {
    try {
      const groups = this.getAll()
      const newGroups = groups.filter((g) => g.groupId !== groupId)
      this.saveAll(newGroups)
      return newGroups
    } catch (error) {
      logger.error(`delete group error: ${error}`)
      return this.getAll()
    }
  }
}
