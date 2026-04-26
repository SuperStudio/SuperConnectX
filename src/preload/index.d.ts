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

declare global {
  interface Window {
    storageApi: {
      getConnections: () => Promise<any[]>
      addConnection: (conn: any) => Promise<any>
      updateConnection: (conn: any) => Promise<any>
      deleteConnection: (id: number) => Promise<any[]>

      getPresetCommands: () => Promise<any[]>
      addPresetCommand: (cmd: any) => Promise<any>
      updatePresetCommand: (cmd: any) => Promise<any>
      deletePresetCommand: (id: number) => Promise<any[]>

      getCommandGroups: () => Promise<any[]>
      addCommandGroup: (group: any) => Promise<{ groupId: number; name: string }>
      updateCommandGroup: (group: any) => Promise<any[]>
      deleteCommandGroup: (groupId: number) => Promise<any[]>

      exportCommands: (filePath: string) => Promise<any>
      importCommands: (filePath: string) => Promise<any>
    }
    connectApi: {
      startConnect: (conn: any) => Promise<any>
      sendData: (data: { conn: any; command: string }) => Promise<any>
      stopConnect: (conn: any) => Promise<any>
      onRecvData: (callback: (data: { connId: number; data: string }) => void) => () => void
      onConnectClose: (callback: (connId: number) => void) => () => void
      openConnectLog: (sessionId: string) => Promise<{ success: boolean; message?: string; filePath?: string }>
      getLogFilePath: (sessionId: string) => Promise<{ success: boolean; filePath?: string; message?: string }>
      copyLogFile: (sessionId: string, destPath: string) => Promise<{ success: boolean; message?: string }>
      listSerialPorts: () => Promise<SerialPortInfo[]>
    }
    windowApi: {
      minimizeWindow: () => Promise<void>
      maximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
      getWindowState: () => Promise<boolean>
      getAppVersion: () => Promise<string>
    }
    toolApi: {
      openDevtools: () => Promise<void>
      getAppResource: () => Promise<any>
      openExternalUrl: (url: string) => Promise<any>
      openAppDir: () => Promise<any>
      writeFile: (options: { path: string; content: string }) => Promise<{ success: boolean }>
      readFile: (options: { path: string }) => Promise<{ success: boolean; content?: string; message?: string }>
      showItemInFolder: (filePath: string) => Promise<void>
    }
    dialogApi: {
      openFileDialog: (options: any) => Promise<any>
      saveFileDialog: (options: any) => Promise<any>
    }
  }
}

export {}
