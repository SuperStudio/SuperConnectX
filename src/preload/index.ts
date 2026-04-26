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
  importCommands: (filePath: string) => ipcRenderer.invoke('import-commands', filePath)
})

contextBridge.exposeInMainWorld('connectApi', {
  startConnect: (conn: any) => ipcRenderer.invoke('start-connect', conn),
  sendData: (data: { conn: any; command: string }) => ipcRenderer.invoke('send-data', data),
  stopConnect: (conn: any) => ipcRenderer.invoke('stop-connect', conn),

  onRecvData: (callback: (data: { connId: number; data: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { connId: number; data: string }) =>
      callback(data)
    ipcRenderer.on('on-recv-data', listener)
    return () => ipcRenderer.removeListener('on-recv-data', listener)
  },
  onConnectClose: (callback: (connId: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, connId: number) => callback(connId)
    ipcRenderer.on('on-connect-close', listener)
    return () => ipcRenderer.removeListener('on-connect-close', listener)
  },
  openConnectLog: (sessionId: string) => ipcRenderer.invoke('open-connect-log', sessionId),
  getLogFilePath: (sessionId: string) => ipcRenderer.invoke('get-log-file-path', sessionId),
  copyLogFile: (sessionId: string, destPath: string) => ipcRenderer.invoke('copy-log-file', { sessionId, destPath }),
  listSerialPorts: () => ipcRenderer.invoke('list-serial-ports')
})

contextBridge.exposeInMainWorld('dialogApi', {
  openFileDialog: (options: any) => ipcRenderer.invoke('open-file-dialog', options),
  saveFileDialog: (options: any) => ipcRenderer.invoke('save-file-dialog', options)
})

contextBridge.exposeInMainWorld('windowApi', {
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  getWindowState: () => ipcRenderer.invoke('get-window-state'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version')
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
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('show-item-in-folder', filePath)
})
