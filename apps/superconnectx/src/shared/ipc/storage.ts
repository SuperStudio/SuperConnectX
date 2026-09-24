/** Stable IPC names for reusable settings and backup capabilities. */
export const STORAGE_IPC_CHANNELS = {
  getAppPreferences: 'get-app-settings',
  saveAppPreferences: 'save-app-settings',
  getSettings: 'get-settings',
  getDefaultSettings: 'get-default-settings',
  saveSettings: 'save-settings',
  getBackupList: 'get-backup-list',
  performBackup: 'perform-backup',
  restoreBackup: 'restore-backup',
  getNextBackupDate: 'get-next-backup-date'
} as const

export type StorageIpcChannel = (typeof STORAGE_IPC_CHANNELS)[keyof typeof STORAGE_IPC_CHANNELS]
