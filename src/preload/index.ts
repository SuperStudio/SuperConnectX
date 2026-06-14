// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron'

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

  /* COM 串口设置 */
  getComSettings: (comName: string) => ipcRenderer.invoke('get-com-settings', comName),
  saveComSettings: (comName: string, settings: any) => ipcRenderer.invoke('save-com-settings', comName, settings),
  /* 全局波特率列表 */
  getBaudRates: () => ipcRenderer.invoke('get-baud-rates'),
  saveBaudRates: (baudRates: number[]) => ipcRenderer.invoke('save-baud-rates', baudRates),

  /* 应用全局设置 */
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  saveAppSettings: (settings: any) => ipcRenderer.invoke('save-app-settings', settings),

  /* 设置页面 */
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getDefaultSettings: () => ipcRenderer.invoke('get-default-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),

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
  getBackupList: () => ipcRenderer.invoke('get-backup-list'),
  restoreBackup: (dateStr: string) => ipcRenderer.invoke('restore-backup', dateStr),
  getNextBackupDate: (backupInterval: number) => ipcRenderer.invoke('get-next-backup-date', backupInterval)
})

contextBridge.exposeInMainWorld('connectApi', {
  startConnect: (conn: any) => ipcRenderer.invoke('start-connect', conn),
  startConnectById: (id: number, sessionId: number, extraFields?: any) => ipcRenderer.invoke('start-connect-by-id', { id, sessionId, extraFields }),
  sendData: (data: { conn: any; command: string }) => ipcRenderer.invoke('send-data', data),
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
  listSerialPorts: () => ipcRenderer.invoke('list-serial-ports'),
  writeToLog: (sessionId: string, content: string) => ipcRenderer.invoke('write-to-log', { sessionId, content })
})

contextBridge.exposeInMainWorld('dialogApi', {
  openFileDialog: (options: any) => ipcRenderer.invoke('open-file-dialog', options),
  saveFileDialog: (options: any) => ipcRenderer.invoke('save-file-dialog', options),
  openDirectoryDialog: (options: any) => ipcRenderer.invoke('open-directory-dialog', options)
})

contextBridge.exposeInMainWorld('windowApi', {
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  getWindowState: () => ipcRenderer.invoke('get-window-state'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  toggleFullscreenWindow: () => ipcRenderer.invoke('toggle-fullscreen-window')
})

contextBridge.exposeInMainWorld('toolApi', {
  openDevtools: () => ipcRenderer.invoke('open-devtools'),
  getAppResource: () => ipcRenderer.invoke('get-app-resource'),
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),
  openAppDir: () => ipcRenderer.invoke('open-app-dir'),
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
