declare global {
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

  interface SyntaxSubRule {
    id: number
    matchType: 'regex' | 'keyword'
    pattern: string
    caseSensitive: boolean
    foreground: string
    background: string
    bold: boolean
    italic: boolean
    underline: boolean
  }

  interface SyntaxRuleGroup {
    id: number
    name: string
    subRules: SyntaxSubRule[]
    previewText?: string
  }

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
      importFromSuperCom: (filePath: string) => Promise<any>

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
      getSyntaxRuleGroups: () => Promise<SyntaxRuleGroup[]>
      saveSyntaxRuleGroups: (groups: SyntaxRuleGroup[]) => Promise<boolean>
      getBackupList: () => Promise<{ date: string; size: number }[]>
      restoreBackup: (dateStr: string) => Promise<{ success: boolean; message: string }>
      getNextBackupDate: (backupInterval: number) => Promise<string | null>
    }
    connectApi: {
      startConnect: (conn: any) => Promise<any>
      startConnectById: (id: number, sessionId: string, extraFields?: any) => Promise<any>
      sendData: (data: { conn: any; command: string }) => Promise<any>
      uploadFile: (data: { conn: any; localFilePath: string; remoteFileName: string }) => Promise<any>
      stopConnect: (conn: any) => Promise<any>
      updateConnect: (conn: any, config: any) => Promise<{ success: boolean; message?: string }>
      onRecvData: (callback: (data: { connId: number; data: string; timestamp?: string; isHex?: boolean }) => void) => () => void
      onConnectClose: (callback: (connId: number) => void) => () => void
      onLogSplit: (callback: (data: { connId: string; oldFileName: string; newFileName: string }) => void) => () => void
      openConnectLog: (sessionId: string, mode?: 'folder' | 'file') => Promise<{ success: boolean; message?: string; filePath?: string }>
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
      toggleFullscreenWindow: () => Promise<void>
    }
    toolApi: {
      openDevtools: () => Promise<void>
      getAppResource: () => Promise<any>
      openExternalUrl: (url: string) => Promise<any>
      openAppDir: () => Promise<any>
      openUserDataDir: () => Promise<any>
      writeFile: (options: { path: string; content: string }) => Promise<{ success: boolean }>
      readFile: (options: { path: string }) => Promise<{ success: boolean; content?: string; message?: string }>
      showItemInFolder: (filePath: string) => Promise<void>
      notifySettingsUpdate: (settings: any) => void
    }
    dialogApi: {
      openFileDialog: (options: any) => Promise<any>
      saveFileDialog: (options: any) => Promise<any>
      openDirectoryDialog: (options: any) => Promise<any>
    }
    dataCheckApi: {
      getPlugins: () => Promise<{ name: string; type: string }[]>
      checkData: (pluginName: string, hexData: string) => Promise<{
        plugin: string
        hexResult: string
        details: { resultName: string; resultValue: string; resultType: string }[]
      }>
    }
    updateApi: {
      checkForUpdates: () => Promise<void>
      startDownload: () => Promise<void>
      cancelDownload: () => Promise<void>
      quitAndInstall: () => Promise<void>
      getCachedUpdateInfo: () => Promise<any>
      onUpdateStatus: (callback: (data: { status: string; data?: any }) => void) => () => void
    }
    logApi: {
      info: (message: string, meta?: any) => Promise<void>
      warn: (message: string, meta?: any) => Promise<void>
      error: (message: string, meta?: any) => Promise<void>
      debug: (message: string, meta?: any) => Promise<void>
    }
  }
}

export {}
