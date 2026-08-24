// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron'
import { WINDOW_IPC_CHANNELS } from '../shared/ipc/window'
import { STORAGE_IPC_CHANNELS } from '../shared/ipc/storage'
import type { AiServiceStatus, AiSelfTestResult, RuntimeUiEvent } from '../shared/extensions/ai-control/AiServiceTypes'
import type { AiConfigDocument, AiConfigPatch } from '../shared/extensions/ai-control/AiConfigTypes'
import type { AiActivityEntry } from '../shared/extensions/ai-control/AiActivityTypes'

// 暴露 IPC 调用接口给渲染进程
contextBridge.exposeInMainWorld('storageApi', {
  /* 连接存储 */
  getConnections: () => ipcRenderer.invoke('get-connections'),
  addConnection: (conn: any) => ipcRenderer.invoke('add-connection', conn),
  updateConnection: (conn: any) => ipcRenderer.invoke('update-connection', conn),
  deleteConnection: (id: number) => ipcRenderer.invoke('delete-connection', id),
  /* 预设命令 */
  addPresetCommand: (cmd: any) => ipcRenderer.invoke('add-preset-command', cmd),
  updatePresetCommand: (cmd: any) => ipcRenderer.invoke('update-preset-command', cmd),
  deletePresetCommand: (id: number) => ipcRenderer.invoke('delete-preset-command', id),
  getPresetCommands: () => ipcRenderer.invoke('get-preset-commands'),

  /* 组 */
  getCommandGroups: () => ipcRenderer.invoke('get-command-groups'),
  addCommandGroup: (group: any) => ipcRenderer.invoke('add-command-group', group),
  updateCommandGroup: (group: any) => ipcRenderer.invoke('update-command-group', group),
  deleteCommandGroup: (groupId: number) => ipcRenderer.invoke('delete-command-group', groupId),
  exportCommands: (filePath: string) => ipcRenderer.invoke('export-commands', filePath),
  importCommands: (filePath: string) => ipcRenderer.invoke('import-commands', filePath),
  importFromSuperCom: (filePath: string) => ipcRenderer.invoke('import-from-supercom', filePath),
  exportData: (filePath: string, selections: string[]) => ipcRenderer.invoke('export-data', filePath, selections),
  importData: (filePath: string) => ipcRenderer.invoke('import-data', filePath),

  /* COM 串口设置 */
  getComSettings: (comName: string) => ipcRenderer.invoke('get-com-settings', comName),
  saveComSettings: (comName: string, settings: any) => ipcRenderer.invoke('save-com-settings', comName, settings),
  /* 全局波特率列表 */
  getBaudRates: () => ipcRenderer.invoke('get-baud-rates'),
  saveBaudRates: (baudRates: number[]) => ipcRenderer.invoke('save-baud-rates', baudRates),

  /* 应用全局设置 */
  getAppSettings: () => ipcRenderer.invoke(STORAGE_IPC_CHANNELS.getAppPreferences),
  saveAppSettings: (settings: any) => ipcRenderer.invoke(STORAGE_IPC_CHANNELS.saveAppPreferences, settings),

  /* 日志过滤面板 */
  getLogFilter: () => ipcRenderer.invoke('get-log-filter'),
  saveLogFilter: (settings: any) => ipcRenderer.invoke('save-log-filter', settings),

  /* 设置页面 */
  getSettings: () => ipcRenderer.invoke(STORAGE_IPC_CHANNELS.getSettings),
  getDefaultSettings: () => ipcRenderer.invoke(STORAGE_IPC_CHANNELS.getDefaultSettings),
  saveSettings: (settings: any) => ipcRenderer.invoke(STORAGE_IPC_CHANNELS.saveSettings, settings),

  /* 快捷键设置 */
  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),
  getDefaultShortcuts: () => ipcRenderer.invoke('get-default-shortcuts'),
  saveShortcuts: (shortcuts: any[]) => ipcRenderer.invoke('save-shortcuts', shortcuts),
  getShortcutActions: () => ipcRenderer.invoke('get-shortcut-actions'),

  /* 命令历史 */
  getCommandHistory: (protocolType: string) => ipcRenderer.invoke('get-command-history', protocolType),
  addCommandHistory: (protocolType: string, command: string) => ipcRenderer.invoke('add-command-history', protocolType, command),
  clearCommandHistory: (protocolType: string) => ipcRenderer.invoke('clear-command-history', protocolType),
  removeCommandHistory: (protocolType: string, command: string) => ipcRenderer.invoke('remove-command-history', protocolType, command),

  /* 语法高亮规则组 */
  getSyntaxRuleGroups: () => ipcRenderer.invoke('get-syntax-rule-groups'),
  saveSyntaxRuleGroups: (groups: any[]) => ipcRenderer.invoke('save-syntax-rule-groups', groups),

  /* 备份与恢复 */
  getBackupList: () => ipcRenderer.invoke(STORAGE_IPC_CHANNELS.getBackupList),
  performBackup: () => ipcRenderer.invoke(STORAGE_IPC_CHANNELS.performBackup),
  restoreBackup: (dateStr: string) => ipcRenderer.invoke(STORAGE_IPC_CHANNELS.restoreBackup, dateStr),
  getNextBackupDate: (backupInterval: number) => ipcRenderer.invoke(STORAGE_IPC_CHANNELS.getNextBackupDate, backupInterval)
})

contextBridge.exposeInMainWorld('connectApi', {
  startConnect: (conn: any) => ipcRenderer.invoke('start-connect', conn),
  startConnectById: (id: number, sessionId: string, extraFields?: any) => ipcRenderer.invoke('start-connect-by-id', { id, sessionId, extraFields }),
  sendData: (data: { conn: any; command: string }) => ipcRenderer.invoke('send-data', data),
  updateSessionCommandSettings: (payload: {
    sessionId: string
    settings: { autoNewline: boolean; hexMode: boolean; crcEnabled: boolean; crcMethod: string }
    revision: number
  }) => ipcRenderer.invoke('update-session-command-settings', payload),
  uploadFile: (data: { conn: any; localFilePath: string; remoteFileName: string }) => ipcRenderer.invoke('upload-file', data),
  stopConnect: (conn: any) => ipcRenderer.invoke('stop-connect', conn),
  updateConnect: (conn: any, config: any) => ipcRenderer.invoke('update-connect', { conn, config }),

  onRecvData: (callback: (data: { connId: number; data: string; timestamp?: string; isHex?: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { connId: number; data: string; timestamp?: string; isHex?: boolean }) =>
      callback(data)
    ipcRenderer.on('on-recv-data', listener)
    return () => ipcRenderer.removeListener('on-recv-data', listener)
  },
  onConnectClose: (callback: (connId: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, connId: number) => callback(connId)
    ipcRenderer.on('on-connect-close', listener)
    return () => ipcRenderer.removeListener('on-connect-close', listener)
  },
  onLogSplit: (callback: (data: { connId: string; oldFileName: string; newFileName: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { connId: string; oldFileName: string; newFileName: string }) =>
      callback(data)
    ipcRenderer.on('on-log-split', listener)
    return () => ipcRenderer.removeListener('on-log-split', listener)
  },
  openConnectLog: (sessionId: string, mode: 'folder' | 'file' = 'folder') => ipcRenderer.invoke('open-connect-log', sessionId, mode),
  getLogFilePath: (sessionId: string) => ipcRenderer.invoke('get-log-file-path', sessionId),
  copyLogFile: (sessionId: string, destPath: string) => ipcRenderer.invoke('copy-log-file', { sessionId, destPath }),
  rotateLogFile: (sessionId: string) => ipcRenderer.invoke('rotate-log-file', sessionId),
  listSerialPorts: () => ipcRenderer.invoke('list-serial-ports'),
  fixSerialPermissions: () => ipcRenderer.invoke('fix-serial-permissions'),
  onSerialPortsChanged: (callback: (ports: { path: string }[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ports: { path: string }[]): void => callback(ports)
    ipcRenderer.on('on-serial-ports-changed', listener)
    return () => ipcRenderer.removeListener('on-serial-ports-changed', listener)
  },
  onRuntimeEvent: (callback: (event: RuntimeUiEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, event: RuntimeUiEvent): void => callback(event)
    ipcRenderer.on('on-runtime-event', listener)
    return () => ipcRenderer.removeListener('on-runtime-event', listener)
  },
  writeToLog: (sessionId: string, content: string) => ipcRenderer.invoke('write-to-log', { sessionId, content })
})

contextBridge.exposeInMainWorld('dialogApi', {
  openFileDialog: (options: any) => ipcRenderer.invoke('open-file-dialog', options),
  saveFileDialog: (options: any) => ipcRenderer.invoke('save-file-dialog', options),
  openDirectoryDialog: (options: any) => ipcRenderer.invoke('open-directory-dialog', options)
})

contextBridge.exposeInMainWorld('windowApi', {
  minimizeWindow: () => ipcRenderer.invoke(WINDOW_IPC_CHANNELS.minimize),
  maximizeWindow: () => ipcRenderer.invoke(WINDOW_IPC_CHANNELS.toggleMaximize),
  closeWindow: () => ipcRenderer.invoke(WINDOW_IPC_CHANNELS.close),
  getWindowState: () => ipcRenderer.invoke(WINDOW_IPC_CHANNELS.getMaximized),
  getAppVersion: () => ipcRenderer.invoke(WINDOW_IPC_CHANNELS.getAppVersion),
  toggleFullscreenWindow: () => ipcRenderer.invoke(WINDOW_IPC_CHANNELS.toggleFullscreen)
})

contextBridge.exposeInMainWorld('toolApi', {
  openDevtools: () => ipcRenderer.invoke('open-devtools'),
  getAppResource: () => ipcRenderer.invoke('get-app-resource'),
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),
  openAppDir: () => ipcRenderer.invoke('open-app-dir'),
  openUserDataDir: () => ipcRenderer.invoke('open-user-data-dir'),
  writeFile: ({ path: filePath, content }: { path: string; content: string }) =>
    ipcRenderer.invoke('write-file', { path: filePath, content }),
  readFile: ({ path: filePath }: { path: string }) =>
    ipcRenderer.invoke('read-file', { path: filePath }),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('show-item-in-folder', filePath),
  // 防止屏幕息屏及系统休眠
  notifySettingsUpdate: (settings: any) => ipcRenderer.send('settings-updated', settings)
})

contextBridge.exposeInMainWorld('dataCheckApi', {
  getPlugins: () => ipcRenderer.invoke('datacheck:getPlugins'),
  checkData: (pluginName: string, hexData: string) => ipcRenderer.invoke('datacheck:checkData', pluginName, hexData)
})

contextBridge.exposeInMainWorld('logApi', {
  info: (message: string, meta?: any) => ipcRenderer.invoke('logger:info', message, meta),
  warn: (message: string, meta?: any) => ipcRenderer.invoke('logger:warn', message, meta),
  error: (message: string, meta?: any) => ipcRenderer.invoke('logger:error', message, meta),
  debug: (message: string, meta?: any) => ipcRenderer.invoke('logger:debug', message, meta)
})

contextBridge.exposeInMainWorld('aiServiceApi', {
  getState: (): Promise<AiServiceStatus> => ipcRenderer.invoke('ai-service:get-state'),
  setPermission: (permission: 'read-only' | 'full-control'): Promise<AiServiceStatus> => ipcRenderer.invoke('ai-service:set-permission', permission),
  getConfig: (): Promise<AiConfigDocument> => ipcRenderer.invoke('ai-service:get-config'),
  saveConfig: (patch: AiConfigPatch): Promise<AiConfigDocument> => ipcRenderer.invoke('ai-service:save-config', patch),
  runSelfTest: (): Promise<AiSelfTestResult> => ipcRenderer.invoke('ai-service:run-self-test'),
  rotateToken: () => ipcRenderer.invoke('ai-service:rotate-token'),
  getCodexConfig: (): Promise<string> => ipcRenderer.invoke('ai-service:get-codex-config'),
  readActivity: (limit = 500): Promise<AiActivityEntry[]> => ipcRenderer.invoke('ai-service:read-activity', limit),
  clearActivity: (): Promise<void> => ipcRenderer.invoke('ai-service:clear-activity'),
  chooseLogDirectory: () => ipcRenderer.invoke('ai-service:choose-log-directory'),
  openLogDirectory: () => ipcRenderer.invoke('ai-service:open-log-directory'),
  onStateChanged: (callback: (status: AiServiceStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: AiServiceStatus): void => callback(status)
    ipcRenderer.on('ai-service:state-changed', listener)
    return () => ipcRenderer.removeListener('ai-service:state-changed', listener)
  },
  onConfigChanged: (callback: (config: AiConfigDocument) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, config: AiConfigDocument): void => callback(config)
    ipcRenderer.on('ai-service:config-changed', listener)
    return () => ipcRenderer.removeListener('ai-service:config-changed', listener)
  }
})

contextBridge.exposeInMainWorld('updateApi', {
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  startDownload: () => ipcRenderer.invoke('start-download'),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  getCachedUpdateInfo: () => ipcRenderer.invoke('get-cached-update-info'),
  onUpdateStatus: (callback: (data: { status: string; data?: any }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { status: string; data?: any }) => callback(data)
    ipcRenderer.on('update-status', listener)
    return () => ipcRenderer.removeListener('update-status', listener)
  }
})

contextBridge.exposeInMainWorld('virtualPortApi', {
  checkConditions: () => ipcRenderer.invoke('virtualport:check-conditions'),
  listPorts: () => ipcRenderer.invoke('virtualport:list-ports'),
  insertPair: (portA: string, portB: string) => ipcRenderer.invoke('virtualport:insert-pair', portA, portB),
  deletePair: (index: number) => ipcRenderer.invoke('virtualport:delete-pair', index),
  updatePorts: (ports: Record<string, unknown>[]) => ipcRenderer.invoke('virtualport:update-ports', ports),
  runSetup: () => ipcRenderer.invoke('virtualport:run-setup'),
  getPlatform: () => process.platform
})
