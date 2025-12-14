import Store from 'electron-store'
import { DEFAULT_STORAGE_DIR } from './StorageConstants'
const GROUP_STORE_KEY_NAME = 'cmdGroups'

export default class CommandGroupStorage {
  private groupStore = new Store({
    name: GROUP_STORE_KEY_NAME,
    cwd: DEFAULT_STORAGE_DIR,
    defaults: {
      groups: []
    }
  })

  constructor() {}

  getAll() {
    return this.groupStore.get(GROUP_STORE_KEY_NAME) || []
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
      this.groupStore.set(GROUP_STORE_KEY_NAME, groups)
      return newGroup
    } catch (error) {
      console.error('添加组失败:', error)
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
      this.groupStore.set(GROUP_STORE_KEY_NAME, groups)
      return groups[index]
    } catch (error) {
      console.error('更新组失败:', error)
      return null
    }
  }

  delete(groupId: number) {
    try {
      const groups = this.getAll()
      const newGroups = groups.filter((g) => g.groupId !== groupId)
      this.groupStore.set(GROUP_STORE_KEY_NAME, newGroups)
      return newGroups
    } catch (error) {
      console.error('删除组失败:', error)
      return this.getAll()
    }
  }
}
