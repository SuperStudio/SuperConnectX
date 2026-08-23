import fs from 'fs'
import path from 'path'
import logger from '../ipc/IpcAppLogger'
import { getAppDataDir } from './AppDir'
import SnapshotBackupService from '../../core/backup/SnapshotBackupService'

const BACKUP_DIR_NAME = 'backup'
const USERDATA_DIR_NAME = 'userdata'

/**
 * SuperConnectX adapter for the reusable directory snapshot service.
 * New applications should create `SnapshotBackupService` with their own paths.
 */
export default class BackupManager {
  private static sInstance: BackupManager
  private readonly backupService: SnapshotBackupService

  private constructor() {
    const appDataDir = getAppDataDir()
    this.backupService = new SnapshotBackupService({
      dataDirectory: path.join(appDataDir, USERDATA_DIR_NAME),
      backupDirectory: path.join(appDataDir, BACKUP_DIR_NAME),
      logger
    })
  }

  static getInstance(): BackupManager {
    if (BackupManager.sInstance == null) {
      BackupManager.sInstance = new BackupManager()
    }
    return BackupManager.sInstance
  }

  performBackup(backupInterval: number): void {
    this.backupService.performBackup(backupInterval)
  }

  performBackupNow(): { success: boolean; message: string; date?: string } {
    if (!fs.existsSync(path.join(getAppDataDir(), USERDATA_DIR_NAME))) {
      logger.info('[BackupManager] userdata directory not found, skip backup')
      return { success: false, message: 'userdata directory not found' }
    }
    return this.backupService.performBackupNow()
  }

  getBackupList(): { date: string; size: number }[] {
    return this.backupService.getBackupList()
  }

  getNextBackupDate(backupInterval: number): string | null {
    return this.backupService.getNextBackupDate(backupInterval)
  }

  restoreBackup(dateStr: string): { success: boolean; message: string } {
    return this.backupService.restoreBackup(dateStr)
  }
}
