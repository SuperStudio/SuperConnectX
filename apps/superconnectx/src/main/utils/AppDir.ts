/**
 * Compatibility facade for the legacy application-path module.
 * New code should import `AppPaths` from `src/core/paths/AppPaths` directly.
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { AppPaths, type AppPathLogger } from '../../core/paths/AppPaths'

const appPaths = new AppPaths({ sessionDataName: 'superconnectx-session' })

export function getInstanceIndex(): number {
  return appPaths.getInstanceIndex()
}

export function getExeDir(): string {
  return appPaths.getExeDir()
}

export function getAppDataDir(): string {
  return appPaths.getAppDataDir()
}

export function getChromiumDataDir(): string {
  return appPaths.getChromiumDataDir()
}

export function overrideUserDataDirIfSet(): void {
  appPaths.overrideUserDataDirIfSet()
}

/** Must be called before `app.whenReady()`. */
export function initAppPaths(): void {
  appPaths.init()
}

/** Must be called after `app.whenReady()`. */
export function cleanupChromiumClutter(logger?: AppPathLogger): void {
  appPaths.cleanupChromiumClutter(logger)
}

export function migrateDataIfNeeded(logger?: AppPathLogger): void {
  // Temporary compatibility for SuperConnectX installations created before
  // data moved under Electron userData. This is intentionally not core API.
  if (getInstanceIndex() > 0) return

  const appDataDir = getAppDataDir()
  for (const legacyDir of getLegacyDataDirs()) {
    if (isSameDirectory(legacyDir, appDataDir)) continue
    for (const name of ['userdata', 'backup', 'logs', 'app-logs']) {
      const source = path.join(legacyDir, name)
      if (!fs.existsSync(source)) continue
      const destination = path.join(appDataDir, name)
      try {
        copyDirectory(source, destination)
        fs.rmSync(source, { recursive: true, force: true })
        logger?.info(`[AppDir] migrated: ${source} -> ${destination}`)
      } catch (error) {
        logger?.info(`[AppDir] migration failed: ${name} - ${error}`)
      }
    }
  }
}

function getLegacyDataDirs(): string[] {
  const directories = [getExeDir()]
  try {
    const appPath = app.getAppPath()
    const directory = appPath.endsWith('.asar') ? path.dirname(appPath) : appPath
    if (!isSameDirectory(directory, directories[0])) directories.push(directory)
  } catch {
    // ignore
  }
  return directories
}

function isSameDirectory(first: string, second: string): boolean {
  try {
    return fs.realpathSync(first) === fs.realpathSync(second)
  } catch {
    return path.resolve(first) === path.resolve(second)
  }
}

function copyDirectory(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name)
    const destinationPath = path.join(destination, entry.name)
    if (entry.isDirectory()) copyDirectory(sourcePath, destinationPath)
    else fs.copyFileSync(sourcePath, destinationPath)
  }
}
