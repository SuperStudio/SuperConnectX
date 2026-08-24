/**
 * 连接档案与命令目录的项目级访问端口。
 * GUI IPC 和 AI 扩展复用同一批 Storage 实例，避免产生第二套目录数据。
 */
export interface CoreCatalog {
  listConnections: () => unknown[]
  createConnection: (connection: Record<string, unknown>) => unknown
  updateConnection: (connection: Record<string, unknown>) => unknown
  deleteConnection: (connectionId: number) => unknown
  listCommandGroups: () => unknown[]
  createCommandGroup: (group: Record<string, unknown>) => unknown
  updateCommandGroup: (group: Record<string, unknown>) => unknown
  deleteCommandGroup: (groupId: number) => unknown
  listPresetCommands: () => unknown[]
  createPresetCommand: (command: Record<string, unknown>) => unknown
  updatePresetCommand: (command: Record<string, unknown>) => unknown
  deletePresetCommand: (commandId: number) => unknown
}
