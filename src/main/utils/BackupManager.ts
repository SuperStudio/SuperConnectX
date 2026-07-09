import fs from 'fs'
import path from 'path'
import logger from '../ipc/IpcAppLogger'
import { getAppDataDir } from './AppDir'

const BACKUP_DIR_NAME = 'backup'
const USERDATA_DIR_NAME = 'userdata'

export default class BackupManager {
  private static sInstance: BackupManager

  static getInstance(): BackupManager {
    if (BackupManager.sInstance == null) {
      BackupManager.sInstance = new BackupManager()
    }
    return BackupManager.sInstance
  }

  /**
   * 获取应用数据根目录（与 storage、logs 等统一使用 getAppDataDir）
   */
  private getAppDir(): string {
    return getAppDataDir()
  }

  /**
   * 获取 userdata 目录路径
   */
  private getUserDataPath(): string {
    return path.join(this.getAppDir(), USERDATA_DIR_NAME)
  }

  /**
   * 获取 backup 目录路径
   */
  private getBackupDir(): string {
    return path.join(this.getAppDir(), BACKUP_DIR_NAME)
  }

  /**
   * 确保目录存在
   */
  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  }

  /**
   * 递归拷贝目录
   */
  private copyDirSync(src: string, dest: string): void {
    this.ensureDir(dest)
    const entries = fs.readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      if (entry.isDirectory()) {
        this.copyDirSync(srcPath, destPath)
      } else {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }

  /**
   * 获取今天的日期字符串，格式 YYYY-MM-DD
   */
  private getTodayStr(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  /**
   * 解析日期字符串 YYYY-MM-DD 为 Date 对象
   */
  private parseDateStr(dateStr: string): Date | null {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return null
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }

  /**
   * 获取 backup 目录下最近的备份日期目录名
   * 返回日期字符串，如果没有则返回 null
   */
  private getLastBackupDate(): string | null {
    const backupDir = this.getBackupDir()
    if (!fs.existsSync(backupDir)) return null

    const entries = fs.readdirSync(backupDir, { withFileTypes: true })
    const dates: string[] = []
    for (const entry of entries) {
      if (entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name)) {
        dates.push(entry.name)
      }
    }
    if (dates.length === 0) return null

    // 按日期降序排列，取最新的
    dates.sort((a, b) => b.localeCompare(a))
    return dates[0]
  }

  /**
   * 计算两个日期字符串之间的天数差
   */
  private daysBetween(dateStr1: string, dateStr2: string): number {
    const d1 = this.parseDateStr(dateStr1)
    const d2 = this.parseDateStr(dateStr2)
    if (!d1 || !d2) return Infinity
    return Math.abs(Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)))
  }

  /**
   * 检查是否需要备份
   * @param backupInterval 备份周期（天）
   * @returns true 表示需要备份
   */
  private shouldBackup(backupInterval: number): boolean {
    const lastDate = this.getLastBackupDate()
    if (!lastDate) {
      // 从未备份过，需要备份
      return true
    }
    const today = this.getTodayStr()
    const diff = this.daysBetween(lastDate, today)
    return diff >= backupInterval
  }

  /**
   * 执行备份：将 userdata 目录拷贝到 backup/YYYY-MM-DD 目录
   */
  performBackup(backupInterval: number): void {
    const userDataPath = this.getUserDataPath()
    if (!fs.existsSync(userDataPath)) {
      logger.info('[BackupManager] userdata directory not found, skip backup')
      return
    }

    if (!this.shouldBackup(backupInterval)) {
      logger.info(`[BackupManager] backup not needed (interval: ${backupInterval} days)`)
      return
    }

    try {
      const backupDir = this.getBackupDir()
      this.ensureDir(backupDir)

      const todayStr = this.getTodayStr()
      const destDir = path.join(backupDir, todayStr)

      // 如果今天的备份已存在，先删除再重新备份
      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true })
      }

      this.copyDirSync(userDataPath, destDir)
      logger.info(`[BackupManager] backup completed: ${destDir}`)
    } catch (error) {
      logger.error(`[BackupManager] backup failed:`, error)
    }
  }

  /**
   * 获取备份列表：返回 backup 目录下所有日期目录的信息
   * @returns 备份日期列表（降序），每个包含日期字符串和目录大小
   */
  getBackupList(): { date: string; size: number }[] {
    const backupDir = this.getBackupDir()
    if (!fs.existsSync(backupDir)) {
      return []
    }

    try {
      const entries = fs.readdirSync(backupDir, { withFileTypes: true })
      const result: { date: string; size: number }[] = []

      for (const entry of entries) {
        if (entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name)) {
          const dirPath = path.join(backupDir, entry.name)
          const size = this.getDirSize(dirPath)
          result.push({ date: entry.name, size })
        }
      }

      // 按日期降序排列
      result.sort((a, b) => b.date.localeCompare(a.date))
      return result
    } catch (error) {
      logger.error('[BackupManager] failed to get backup list:', error)
      return []
    }
  }

  /**
   * 递归计算目录大小（字节）
   */
  private getDirSize(dirPath: string): number {
    let totalSize = 0
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          totalSize += this.getDirSize(fullPath)
        } else {
          const stat = fs.statSync(fullPath)
          totalSize += stat.size
        }
      }
    } catch {
      // ignore
    }
    return totalSize
  }

  /**
   * 计算下一次备份日期
   * 扫描 backup 目录下最近的备份日期，结合备份周期计算下次备份日期
   * @param backupInterval 备份周期（天）
   * @returns 下一次备份日期字符串 YYYY-MM-DD，如果无法计算则返回 null
   */
  getNextBackupDate(backupInterval: number): string | null {
    if (backupInterval <= 0) return null

    const lastDate = this.getLastBackupDate()
    const today = this.getTodayStr()

    if (!lastDate) {
      // 从未备份过，下一次备份就是今天
      return today
    }

    const lastDateObj = this.parseDateStr(lastDate)
    if (!lastDateObj) return null

    // 计算下一次备份日期 = 上次备份日期 + 备份周期
    const nextDate = new Date(lastDateObj)
    nextDate.setDate(nextDate.getDate() + backupInterval)

    const y = nextDate.getFullYear()
    const m = String(nextDate.getMonth() + 1).padStart(2, '0')
    const d = String(nextDate.getDate()).padStart(2, '0')
    const nextDateStr = `${y}-${m}-${d}`

    // 如果下一次备份日期已经过去（即今天 >= 下次备份日期），说明已经该备份了
    // 返回今天作为提示
    if (nextDateStr <= today) {
      return today
    }

    return nextDateStr
  }

  /**
   * 恢复备份：将指定日期的备份目录内容拷贝覆盖 userdata 目录
   * @param dateStr 备份日期字符串，格式 YYYY-MM-DD
   * @returns 恢复结果
   */
  restoreBackup(dateStr: string): { success: boolean; message: string } {
    const backupDir = this.getBackupDir()
    const backupPath = path.join(backupDir, dateStr)

    if (!fs.existsSync(backupPath)) {
      return { success: false, message: `Backup ${dateStr} not found` }
    }

    try {
      const userDataPath = this.getUserDataPath()

      // 删除现有 userdata 目录
      if (fs.existsSync(userDataPath)) {
        fs.rmSync(userDataPath, { recursive: true, force: true })
      }

      // 拷贝备份到 userdata
      this.copyDirSync(backupPath, userDataPath)
      logger.info(`[BackupManager] restore completed: ${dateStr} -> ${userDataPath}`)
      return { success: true, message: `Restored from backup ${dateStr}` }
    } catch (error) {
      logger.error(`[BackupManager] restore failed:`, error)
      return { success: false, message: `Restore failed: ${error}` }
    }
  }
}
