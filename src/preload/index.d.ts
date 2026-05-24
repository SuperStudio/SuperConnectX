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

      getComSettings: (comName: string) => Promise<any>
      saveComSettings: (comName: string, settings: any) => Promise<boolean>
      getBaudRates: () => Promise<number[]>
      saveBaudRates: (baudRates: number[]) => Promise<boolean>
      getAppSettings: () => Promise<any>
      saveAppSettings: (settings: any) => Promise<boolean>
      getSettings: () => Promise<any>
      getDefaultSettings: () => Promise<any>
      saveSettings: (settings: any) => Promise<boolean>
      getShortcuts: () => Promise<any[]>
      getDefaultShortcuts: () => Promise<any[]>
      saveShortcuts: (shortcuts: any[]) => Promise<boolean>
      getShortcutActions: () => Promise<any[]>
      getCommandHistory: (protocolType: string) => Promise<string[]>
      addCommandHistory: (protocolType: string, command: string) => Promise<boolean>
      clearCommandHistory: (protocolType: string) => Promise<boolean>
      removeCommandHistory: (protocolType: string, command: string) => Promise<boolean>
    }
    connectApi: {
      startConnect: (conn: any) => Promise<any>
      sendData: (data: { conn: any; command: string }) => Promise<any>
      stopConnect: (conn: any) => Promise<any>
      updateConnect: (conn: any, config: any) => Promise<{ success: boolean; message?: string }>
      onRecvData: (callback: (data: { connId: number; data: string; timestamp?: string; isHex?: boolean }) => void) => () => void
      onConnectClose: (callback: (connId: number) => void) => () => void
      onLogSplit: (callback: (data: { connId: string; oldFileName: string; newFileName: string }) => void) => () => void
      openConnectLog: (sessionId: string) => Promise<{ success: boolean; message?: string; filePath?: string }>
      getLogFilePath: (sessionId: string) => Promise<{ success: boolean; filePath?: string; message?: string }>
      copyLogFile: (sessionId: string, destPath: string) => Promise<{ success: boolean; message?: string }>
      listSerialPorts: () => Promise<SerialPortInfo[]>
      writeToLog: (sessionId: string, content: string) => Promise<any>
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
      notifySettingsUpdate: (settings: any) => void
    }
    dialogApi: {
      openFileDialog: (options: any) => Promise<any>
      saveFileDialog: (options: any) => Promise<any>
    }
    dataCheckApi: {
      getPlugins: () => Promise<{ name: string; type: string }[]>
      checkData: (pluginName: string, hexData: string) => Promise<{
        plugin: string
        hexResult: string
        details: { resultName: string; resultValue: string; resultType: string }[]
      }>
    }
  }
}

export {}
