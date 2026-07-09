/**
 * AppDir - 应用数据目录
 *
 * 统一使用 Electron 的 userData 目录存放所有用户数据：
 * - 日志、备份、终端日志、用户数据均在此目录下
 * - 首次启动时，若 EXE 同目录存在旧数据，自动迁移并删除
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

/**
 * 获取 exe 所在目录（兼容 macOS 的 .app bundle 结构）
 */
export function getExeDir(): string {
  const exePath = app.getPath('exe')
  let exeDir = path.dirname(exePath)
  if (process.platform === 'darwin') {
    exeDir = path.resolve(exeDir, '../../..')
  }
  return exeDir
}

/**
 * 获取应用数据根目录
 *
 * 统一使用 electron userData 目录
 */
export function getAppDataDir(): string {
  return app.getPath('userData')
}

/**
 * 初始化应用目录结构
 *
 * 将 Electron/Chromium 内置的缓存和存储路径重定向到 userData 的子目录，
 * 避免根目录下出现 DawnGraphiteCache、Network 等散乱的目录。
 *
 * **必须在 app.whenReady() 之前调用才生效。**
 */
export function initAppPaths(): void {
  const userData = getAppDataDir()

  // Electron 内置路径重定向到 userData 子目录，保持根目录整洁
  const redirectMap: Record<string, string> = {
    cache: path.join(userData, 'Cache'),
    crashDumps: path.join(userData, 'CrashDumps'),
    sessionData: path.join(userData, 'SessionData'),
  }

  for (const [name, dirPath] of Object.entries(redirectMap)) {
    try {
      app.setPath(name as any, dirPath)
    } catch {
      // 某些路径在特定平台可能不支持，忽略即可
    }
  }
}

/**
 * 拷贝目录（递归）
 */
function copyDirSync(src: string, dest: string): void {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/**
 * 获取可能包含旧数据的源目录列表
 *
 * 开发环境：exe 在 node_modules/electron/dist/，旧数据在项目根目录
 * 打包环境：exe 在安装目录，旧数据在 exe 同目录
 * 此外也检查 app.getAppPath()（asar 打包时指向 app.asar 所在目录）
 */
function getLegacyDataDirs(): string[] {
  const dirs: string[] = []
  const exeDir = getExeDir()

  // 1. EXE 所在目录（打包环境）
  dirs.push(exeDir)

  // 2. app.getAppPath()（开发环境是项目根目录，打包后是 resources/app.asar 所在目录）
  try {
    const appPath = app.getAppPath()
    const appDir = appPath.endsWith('.asar') ? path.dirname(appPath) : appPath
    if (path.resolve(appDir).toUpperCase() !== path.resolve(exeDir).toUpperCase()) {
      dirs.push(appDir)
    }
  } catch {
    // ignore
  }

  return dirs
}

/**
 * 迁移旧数据目录从 exe/app 目录到 appDataDir
 *
 * 检查 exe 目录和 app.getAppPath() 目录下是否存在旧的 userdata/、backup/ 目录，
 * 将其内容拷贝到 userData 目录下，并删除旧目录。
 *
 * @param logger 可选的日志函数，用于记录迁移过程
 */
export function migrateDataIfNeeded(logger?: { info: (msg: string) => void }): void {
  const appDataDir = getAppDataDir()
  const legacyDirs = getLegacyDataDirs()
  const dirsToMigrate = ['userdata', 'backup']

  for (const legacyDir of legacyDirs) {
    // 如果 legacyDir 就是目标目录，跳过
    if (path.resolve(legacyDir).toUpperCase() === path.resolve(appDataDir).toUpperCase()) {
      continue
    }

    for (const dirName of dirsToMigrate) {
      const oldDir = path.join(legacyDir, dirName)
      const newDir = path.join(appDataDir, dirName)

      if (!fs.existsSync(oldDir)) {
        continue
      }

      // 如果新目录已存在，覆盖拷贝
      if (fs.existsSync(newDir)) {
        logger?.info(`[AppDir] migrate overwrite (target exists): ${dirName}`)
        try {
          copyDirSync(oldDir, newDir)
          logger?.info(`[AppDir] migrated: ${oldDir} -> ${newDir}`)
          fs.rmSync(oldDir, { recursive: true, force: true })
          logger?.info(`[AppDir] removed old dir: ${oldDir}`)
        } catch (err) {
          logger?.info(`[AppDir] migrate failed: ${dirName} - ${err}`)
        }
        continue
      }

      try {
        copyDirSync(oldDir, newDir)
        logger?.info(`[AppDir] migrated: ${oldDir} -> ${newDir}`)
        // 迁移成功后删除旧目录
        fs.rmSync(oldDir, { recursive: true, force: true })
        logger?.info(`[AppDir] removed old dir: ${oldDir}`)
      } catch (err) {
        logger?.info(`[AppDir] migrate failed: ${dirName} - ${err}`)
      }
    }
  }
}
