import fs from 'fs'
import path from 'path'

export interface BackupLogger {
  info(message: string): void
  error(message: string, error?: unknown): void
}

export interface SnapshotBackupServiceOptions {
  dataDirectory: string
  backupDirectory: string
  logger?: BackupLogger
}

export interface BackupResult {
  success: boolean
  message: string
  date?: string
}

export interface BackupListItem {
  date: string
  size: number
}

/**
 * Creates date-named snapshots of one directory and restores them on demand.
 * This service does not know about Electron, app paths, or data schemas.
 */
export default class SnapshotBackupService {
  constructor(private readonly options: SnapshotBackupServiceOptions) {}

  performBackup(intervalInDays: number): void {
    if (!fs.existsSync(this.options.dataDirectory)) {
      this.options.logger?.info('[SnapshotBackup] data directory not found, skipping backup')
      return
    }
    if (!this.shouldBackup(intervalInDays)) {
      this.options.logger?.info(`[SnapshotBackup] backup not needed (interval: ${intervalInDays} days)`)
      return
    }
    this.createSnapshot()
  }

  performBackupNow(): BackupResult {
    if (!fs.existsSync(this.options.dataDirectory)) {
      return { success: false, message: 'data directory not found' }
    }
    try {
      const date = this.createSnapshot()
      return { success: true, message: `backup completed: ${path.join(this.options.backupDirectory, date)}`, date }
    } catch (error) {
      this.options.logger?.error('[SnapshotBackup] manual backup failed', error)
      return { success: false, message: `backup failed: ${error}` }
    }
  }

  getBackupList(): BackupListItem[] {
    if (!fs.existsSync(this.options.backupDirectory)) return []
    try {
      return fs.readdirSync(this.options.backupDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && this.isDateDirectory(entry.name))
        .map((entry) => ({
          date: entry.name,
          size: this.getDirectorySize(path.join(this.options.backupDirectory, entry.name))
        }))
        .sort((first, second) => second.date.localeCompare(first.date))
    } catch (error) {
      this.options.logger?.error('[SnapshotBackup] failed to list backups', error)
      return []
    }
  }

  getNextBackupDate(intervalInDays: number): string | null {
    if (intervalInDays <= 0) return null
    const lastDate = this.getLastBackupDate()
    const today = this.getTodayString()
    if (!lastDate) return today

    const next = this.parseDate(lastDate)
    if (!next) return null
    next.setDate(next.getDate() + intervalInDays)
    const nextDate = this.formatDate(next)
    return nextDate <= today ? today : nextDate
  }

  restoreBackup(date: string): BackupResult {
    const source = path.join(this.options.backupDirectory, date)
    if (!fs.existsSync(source)) return { success: false, message: `Backup ${date} not found` }

    try {
      if (fs.existsSync(this.options.dataDirectory)) {
        fs.rmSync(this.options.dataDirectory, { recursive: true, force: true })
      }
      this.copyDirectory(source, this.options.dataDirectory)
      this.options.logger?.info(`[SnapshotBackup] restored: ${date} -> ${this.options.dataDirectory}`)
      return { success: true, message: `Restored from backup ${date}` }
    } catch (error) {
      this.options.logger?.error('[SnapshotBackup] restore failed', error)
      return { success: false, message: `Restore failed: ${error}` }
    }
  }

  private createSnapshot(): string {
    const date = this.getTodayString()
    const destination = path.join(this.options.backupDirectory, date)
    this.ensureDirectory(this.options.backupDirectory)
    if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true })
    this.copyDirectory(this.options.dataDirectory, destination)
    this.options.logger?.info(`[SnapshotBackup] completed: ${destination}`)
    return date
  }

  private shouldBackup(intervalInDays: number): boolean {
    const lastDate = this.getLastBackupDate()
    return !lastDate || this.daysBetween(lastDate, this.getTodayString()) >= intervalInDays
  }

  private getLastBackupDate(): string | null {
    return this.getBackupList()[0]?.date ?? null
  }

  private ensureDirectory(directory: string): void {
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true })
  }

  private copyDirectory(source: string, destination: string): void {
    this.ensureDirectory(destination)
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const sourcePath = path.join(source, entry.name)
      const destinationPath = path.join(destination, entry.name)
      if (entry.isDirectory()) this.copyDirectory(sourcePath, destinationPath)
      else fs.copyFileSync(sourcePath, destinationPath)
    }
  }

  private getDirectorySize(directory: string): number {
    let size = 0
    try {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name)
        size += entry.isDirectory() ? this.getDirectorySize(entryPath) : fs.statSync(entryPath).size
      }
    } catch {
      // A partially deleted backup is treated as size zero for its missing files.
    }
    return size
  }

  private getTodayString(): string {
    return this.formatDate(new Date())
  }

  private formatDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  private parseDate(value: string): Date | null {
    if (!this.isDateDirectory(value)) return null
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  private isDateDirectory(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value)
  }

  private daysBetween(first: string, second: string): number {
    const firstDate = this.parseDate(first)
    const secondDate = this.parseDate(second)
    if (!firstDate || !secondDate) return Infinity
    return Math.abs(Math.floor((secondDate.getTime() - firstDate.getTime()) / 86_400_000))
  }
}
