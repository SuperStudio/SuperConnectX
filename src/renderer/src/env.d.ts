// src/renderer/src/env.d.ts
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface SerialPortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
  pnpId?: string
  locationId?: string
  friendlyName?: string
  vendorId?: string
  productId?: string
  type?: 'virtual' | 'usb' | 'bluetooth' | 'none'
}

interface ThemePluginInfo {
  id: string
  name: string
  rootDir: string
  backgroundImagePath: string
  backgroundImageUrl: string
  previewImagePath: string
  previewImageUrl: string
  bgColorOpacity: number
  windowBackground: string
}

interface ToolApi {
  openDevtools: () => Promise<void>
  getAppResource: () => Promise<{ cpu: string; memory: string; memRate: string }>
  openExternalUrl: (url: string) => Promise<void>
  openAppDir: () => Promise<void>
  showItemInFolder: (filePath: string) => Promise<void>
}

interface StorageApi {
  getConnections: () => Promise<any[]>
  addConnection: (conn: any) => Promise<any>
  updateConnection: (conn: any) => Promise<any>
  deleteConnection: (id: number) => Promise<any[]>
  addPresetCommand: (cmd: any) => Promise<any>
  updatePresetCommand: (cmd: any) => Promise<any>
  deletePresetCommand: (id: number) => Promise<any[]>
  getPresetCommands: () => Promise<any[]>
  getCommandGroups: () => Promise<any[]>
  addCommandGroup: (group: any) => Promise<any>
  updateCommandGroup: (group: any) => Promise<any>
  deleteCommandGroup: (groupId: number) => Promise<void>
  exportCommands: (filePath: string) => Promise<{ success: boolean; count?: number; message?: string }>
  importCommands: (filePath: string) => Promise<{ success: boolean; imported?: number; skipped?: number; message?: string }>
  getComSettings: (comName: string) => Promise<any>
  saveComSettings: (comName: string, settings: any) => Promise<boolean>
  getBaudRates: () => Promise<number[]>
  saveBaudRates: (baudRates: number[]) => Promise<boolean>
  getAppSettings: () => Promise<any>
  saveAppSettings: (settings: any) => Promise<boolean>
  getSettings: () => Promise<any>
  getDefaultSettings: () => Promise<any>
  getThemePlugins: () => Promise<ThemePluginInfo[]>
  getThemePluginsRoot: () => Promise<string>
  saveSettings: (settings: any) => Promise<boolean>
  getShortcuts: () => Promise<any[]>
  getDefaultShortcuts: () => Promise<any[]>
  saveShortcuts: (shortcuts: any[]) => Promise<boolean>
  getShortcutActions: () => Promise<any[]>
}

interface ConnectApi {
  startConnect: (conn: any) => Promise<any>
  startConnectById: (id: number, sessionId: string, extraFields?: any) => Promise<any>
  sendData: (data: { conn: any; command: string }) => Promise<any>
  uploadFile: (data: { conn: any; localFilePath: string; remoteFileName: string }) => Promise<any>
  stopConnect: (conn: any) => Promise<any>
  updateConnect: (conn: any, config: any) => Promise<any>
  onRecvData: (callback: (data: { connId: number; data: string; timestamp?: string; lineTimestamps?: string[]; isHex?: boolean }) => void) => () => void
  onConnectClose: (callback: (connId: number) => void) => () => void
  onLogSplit: (callback: (data: { connId: string; oldFileName: string; newFileName: string }) => void) => () => void
  openConnectLog: (sessionId: string) => Promise<any>
  getLogFilePath: (sessionId: string) => Promise<string>
  copyLogFile: (sessionId: string, destPath: string) => Promise<any>
  listSerialPorts: () => Promise<any[]>
  writeToLog: (sessionId: string, content: string) => Promise<any>
}

interface DialogApi {
  openFileDialog: (options: any) => Promise<any>
  saveFileDialog: (options: any) => Promise<any>
  openDirectoryDialog: (options: any) => Promise<any>
}

interface WindowApi {
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  getWindowState: () => Promise<any>
  getAppVersion: () => Promise<string>
  toggleFullscreenWindow: () => Promise<void>
}

declare global {
  interface Window {
    toolApi: ToolApi
    storageApi: StorageApi
    connectApi: ConnectApi
    dialogApi: DialogApi
    windowApi: WindowApi
  }
}
