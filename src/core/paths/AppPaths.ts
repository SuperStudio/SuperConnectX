import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export interface AppPathsOptions {
  /** Used to name the isolated Chromium session directory. */
  sessionDataName?: string
  /** Business directories created during initialization. */
  businessDirectories?: string[]
  /** Business directories that must not remain under Chromium runtime data. */
  strayRuntimeBusinessDirectories?: string[]
}

export interface AppPathLogger {
  info(message: string): void
}

const DEFAULT_OPTIONS: Required<AppPathsOptions> = {
  sessionDataName: 'superconnectx-session',
  businessDirectories: ['app-logs', 'logs', 'userdata'],
  strayRuntimeBusinessDirectories: ['userdata', 'backup', 'logs', 'app-logs']
}

const CHROMIUM_CLUTTER_PATTERNS = [
  'DawnGraphiteCache', 'DawnCache', 'GPUCache', 'blob_storage', 'Code Cache',
  'Local Storage', 'shared_proto_db', 'Network Persistent State', 'Platform Notifications',
  'TransportSecurity', 'Trust Tokens', 'Trust Tokens-journal', 'WebStorage',
  'VideoDecodeStats', 'ShaderCache', 'Crashpad', 'CrashpadMetrics-active.pma',
  'CrashpadMetrics.pma', 'First Run', 'Last Version', 'Local State', 'lockfile',
  'Variations', 'BrowserMetrics', 'component_crx_cache', 'OriginTrials', 'Safe Browsing',
  'Segmentation Platform', 'OptimizationGuidePredictionModelDownloads', 'Crowd Deny',
  'FileTypePolicies', 'FirstPartySets', 'MEIPreload', 'PKIMetadata',
  'PrivacySandboxAttestationsPreloaded', 'SafetyTips', 'SSLErrorAssistant', 'TpcdMetadata',
  'WasmTtsEngine', 'ZxcvbnData', 'hyphen-data', 'AutofillStates',
  'OnDeviceHeadSuggestModel', 'OpenCookieDatabase', 'MediaFoundationWidevineCdm', 'WidevineCdm'
]

/**
 * Owns Electron runtime paths and per-instance Chromium isolation.
 * Construct it once before `app.whenReady()`.
 */
export class AppPaths {
  private instanceIndex: number | undefined
  private readonly options: Required<AppPathsOptions>

  constructor(options: AppPathsOptions = {}) {
    this.options = {
      sessionDataName: options.sessionDataName ?? DEFAULT_OPTIONS.sessionDataName,
      businessDirectories: options.businessDirectories ?? DEFAULT_OPTIONS.businessDirectories,
      strayRuntimeBusinessDirectories:
        options.strayRuntimeBusinessDirectories ?? DEFAULT_OPTIONS.strayRuntimeBusinessDirectories
    }
  }

  getInstanceIndex(): number {
    if (this.instanceIndex !== undefined) return this.instanceIndex
    const indexArgument = process.argv.find((argument) => argument.startsWith('--instance-index='))
    const candidate = indexArgument?.split('=')[1] ?? process.env.SCX_INSTANCE_INDEX
    const parsed = candidate === undefined ? 0 : Number.parseInt(candidate, 10)
    this.instanceIndex = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
    return this.instanceIndex
  }

  getExeDir(): string {
    let exeDir = path.dirname(app.getPath('exe'))
    if (process.platform === 'darwin') exeDir = path.resolve(exeDir, '../../..')
    return exeDir
  }

  getAppDataDir(): string {
    return app.getPath('userData')
  }

  getChromiumDataDir(): string {
    const instanceIndex = this.getInstanceIndex()
    return instanceIndex > 0
      ? path.join(this.getAppDataDir(), `_instance_${instanceIndex}`)
      : this.getAppDataDir()
  }

  overrideUserDataDirIfSet(): void {
    const directory = process.env.SCX_USER_DATA_DIR
    if (!directory) return
    try {
      app.setPath('userData', directory)
      app.setPath('sessionData', directory)
    } catch {
      // Electron may reject path changes after initialization.
    }
  }

  init(): void {
    this.overrideUserDataDirIfSet()
    const chromiumDataDir = this.getChromiumDataDir()
    const instanceSuffix = this.getInstanceIndex() > 0 ? `_${this.getInstanceIndex()}` : ''
    const sessionDataDir = path.join(this.getAppDataDir(), `${this.options.sessionDataName}${instanceSuffix}`)
    const runtimeDir = path.join(chromiumDataDir, '_runtime')

    try {
      app.setPath('sessionData', sessionDataDir)
    } catch {
      // ignore
    }
    app.commandLine.appendSwitch('disk-cache-dir', path.join(runtimeDir, 'Cache'))
    app.commandLine.appendSwitch('gpu-disk-cache-dir', path.join(runtimeDir, 'GPUCache'))
    try {
      app.setPath('crashDumps', path.join(runtimeDir, 'CrashDumps'))
    } catch {
      // ignore
    }

    for (const directory of this.options.businessDirectories) {
      fs.mkdirSync(path.join(this.getAppDataDir(), directory), { recursive: true })
    }
  }

  cleanupChromiumClutter(logger?: AppPathLogger): void {
    const chromiumDataDir = this.getChromiumDataDir()
    for (const name of CHROMIUM_CLUTTER_PATTERNS) {
      try {
        const target = path.join(chromiumDataDir, name)
        if (fs.existsSync(target)) {
          fs.rmSync(target, { recursive: true, force: true })
          logger?.info(`[AppPaths] cleaned up Chromium clutter: ${name}`)
        }
      } catch {
        // Files may still be held by Chromium.
      }
    }

    const runtimeDir = path.join(chromiumDataDir, '_runtime')
    if (fs.existsSync(runtimeDir)) {
      this.cleanupBusinessDirectories(runtimeDir, logger)
    }
  }

  private cleanupBusinessDirectories(directory: string, logger?: AppPathLogger): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const target = path.join(directory, entry.name)
      if (this.options.strayRuntimeBusinessDirectories.includes(entry.name)) {
        try {
          fs.rmSync(target, { recursive: true, force: true })
          logger?.info(`[AppPaths] removed stray business directory: ${target}`)
        } catch {
          // ignore
        }
      } else {
        this.cleanupBusinessDirectories(target, logger)
      }
    }
  }

}
