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
  getShortcuts: () => Promise<any[]>
  saveShortcuts: (shortcuts: any[]) => Promise<boolean>
}

declare global {
  interface Window {
    toolApi: ToolApi
    storageApi: StorageApi
  }
}
