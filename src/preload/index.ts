// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron'

// 暴露 IPC 调用接口给渲染进程
contextBridge.exposeInMainWorld('electronStore', {
  getConnections: () => ipcRenderer.invoke('get-connections'),
  addConnection: (conn: any) => ipcRenderer.invoke('add-connection', conn),
  deleteConnection: (id: number) => ipcRenderer.invoke('delete-connection', id)
})

// 类型声明
declare global {
  interface Window {
    electronStore: {
      getConnections: () => Promise<any[]>
      addConnection: (conn: any) => Promise<any>
      deleteConnection: (id: number) => Promise<any[]>
    }
  }
}
