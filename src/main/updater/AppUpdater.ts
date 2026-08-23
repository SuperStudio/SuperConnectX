import { autoUpdater } from 'electron-updater'
import { BrowserWindow, app } from 'electron'
import { CancellationToken } from 'builder-util-runtime'
import logger from '../ipc/IpcAppLogger'
import {
  mapUpdateErrorToFriendlyMessage,
  type UpdateInfo,
  type UpdateStatus
} from '../../core/updater/UpdateSupport'

export type { ProgressInfo, UpdateInfo, UpdateStatus } from '../../core/updater/UpdateSupport'

export default class AppUpdater {
  private static sInstance: AppUpdater
  private mainWindow: BrowserWindow | null = null
  private _cachedUpdateInfo: UpdateInfo | null = null
  private downloadCancellation: CancellationToken | null = null
  private silentMode = false

  static getInstance(): AppUpdater {
    if (!AppUpdater.sInstance) {
      AppUpdater.sInstance = new AppUpdater()
    }
    return AppUpdater.sInstance
  }

  init(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow

    // 开发模式下强制启用更新检查
    if (!app.isPackaged) {
      autoUpdater.forceDevUpdateConfig = true
      autoUpdater.updateConfigPath = null // 使用 dev-app-update.yml
    }

    // 配置 autoUpdater - 支持断点续传
    autoUpdater.autoDownload = false // 手动控制下载，让用户选择
    autoUpdater.autoInstallOnAppQuit = true // 退出时自动安装
    autoUpdater.allowDowngrade = false
    autoUpdater.allowPrerelease = false
    autoUpdater.disableDifferentialDownload = true // 禁用差分下载，避免 ENOENT 错误

    // 日志输出
    autoUpdater.logger = {
      info: (msg) => logger.info(`[Updater] ${msg}`),
      warn: (msg) => logger.info(`[Updater] ${msg}`),
      error: (msg) => logger.error(`[Updater] ${msg}`),
      debug: (msg) => logger.info(`[Updater] ${msg}`)
    }

    // ========== 事件监听 ==========

    // 检查更新时触发
    autoUpdater.on('checking-for-update', () => {
      logger.info('[Updater] Checking for updates...')
      this.sendStatus('checking')
    })

    // 发现新版本
    autoUpdater.on('update-available', (info) => {
      logger.info(`[Updater] New version available: ${info.version}`)
      this._cachedUpdateInfo = {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : Array.isArray(info.releaseNotes)
            ? info.releaseNotes.map((n: any) => n.note || n).join('\n')
            : '',
        files: info.files?.map((f) => ({ url: f.url, size: f.size ?? 0 }))
      }
      this.sendStatus('update-available', this._cachedUpdateInfo)
    })

    // 没有新版本
    autoUpdater.on('update-not-available', (info) => {
      logger.info(`[Updater] Already up to date: ${info.version}`)
      this.sendStatus('update-not-available', { version: info.version, releaseDate: info.releaseDate })
    })

    // 下载进度（支持断点续传，百分比会反映实际进度）
    autoUpdater.on('download-progress', (progress) => {
      this.sendStatus('download-progress', {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      })
    })

    // 更新包下载完成
    autoUpdater.on('update-downloaded', (info) => {
      logger.info(`[Updater] Update downloaded: ${info.version}`)
      this.sendStatus('update-downloaded', {
        version: info.version,
        releaseNotes: this._cachedUpdateInfo?.releaseNotes || ''
      })
    })

    // 下载出错
    autoUpdater.on('error', (error) => {
      logger.error(`[Updater] Update error: ${error.message}`)
      // 取消下载引发的错误不通知前端
      if (this.downloadCancellation?.cancelled) {
        return
      }
      // 断点续传相关错误不视为致命错误
      if (error.message?.includes('sha512') || error.message?.includes('sha512') || error.message?.includes('checksum')) {
        this.sendStatus('error', { message: mapUpdateErrorToFriendlyMessage(error) })
        // 清除缓存重新下载
        autoUpdater.downloadUpdate().catch(() => {})
      } else {
        this.sendStatus('error', { message: mapUpdateErrorToFriendlyMessage(error) })
      }
    })

    logger.info('[Updater] Initialization complete')
  }

  /** 检查更新 */
  async checkForUpdates(): Promise<void> {
    try {
      logger.info('[Updater] Starting update check')
      await autoUpdater.checkForUpdates()
    } catch (err: any) {
      logger.error(`[Updater] Update check failed: ${err.message}`)
      this.sendStatus('check-error', { message: mapUpdateErrorToFriendlyMessage(err) })
    }
  }

  /** 开始下载更新 */
  async startDownload(): Promise<void> {
    try {
      // 如果上次下载未完成（内部 downloadPromise 还在），先重置
      const appUpdater = (autoUpdater as any)._appUpdater || (autoUpdater as any).appUpdater
      if (appUpdater && appUpdater.downloadPromise) {
        logger.info('[Updater] Resetting stale download promise')
        appUpdater.downloadPromise = null
      }

      logger.info('[Updater] Starting download')
      this.downloadCancellation = new CancellationToken()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await autoUpdater.downloadUpdate(this.downloadCancellation as any)
    } catch (err: any) {
      if (this.downloadCancellation?.cancelled) {
        logger.info('[Updater] Download cancelled by user')
        // 取消后通知前端回到发现新版本界面
        this.sendStatus('update-available', this._cachedUpdateInfo)
      } else {
        logger.error(`[Updater] Download failed: ${err.message}`)
        this.sendStatus('error', { message: mapUpdateErrorToFriendlyMessage(err) })
      }
    } finally {
      this.downloadCancellation = null
    }
  }

  /** 取消下载 */
  cancelDownload(): void {
    if (this.downloadCancellation) {
      logger.info('[Updater] Cancelling download')
      this.downloadCancellation.cancel()
    }
  }

  /** 立即安装并重启 */
  quitAndInstall(): void {
    logger.info('[Updater] Quit and install update')
    autoUpdater.quitAndInstall(false, true)
  }

  /** 获取缓存的更新信息 */
  get cachedUpdateInfo(): UpdateInfo | null {
    return this._cachedUpdateInfo
  }

  /** 向渲染进程发送更新状态 */
  private sendStatus(status: UpdateStatus, data?: any): void {
    if (this.silentMode) return
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update-status', { status, data })
    }
  }
}
