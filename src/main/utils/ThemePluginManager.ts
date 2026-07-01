import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { getAppDataDir, getExeDir } from './AppDir'

export interface ThemePluginInfo {
  id: string
  name: string
  rootDir: string
  backgroundImagePath: string
  backgroundImageUrl: string
  previewImagePath: string
  previewImageUrl: string
  bgColorOpacity: number
  windowBackground: string
}

const THEME_PLUGIN_SEGMENTS = ['plugins', 'themes']

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((item) => path.resolve(item)))]
}

function getThemePluginCandidates(): string[] {
  return uniquePaths([
    path.join(process.cwd(), ...THEME_PLUGIN_SEGMENTS),
    path.join(getExeDir(), ...THEME_PLUGIN_SEGMENTS),
    path.join(app.getAppPath(), ...THEME_PLUGIN_SEGMENTS),
    path.join(getAppDataDir(), ...THEME_PLUGIN_SEGMENTS)
  ])
}

export function getThemePluginRoot(): string {
  for (const candidate of getThemePluginCandidates()) {
    try {
      fs.mkdirSync(candidate, { recursive: true })
      return candidate
    } catch {
      // try next candidate
    }
  }

  return path.join(process.cwd(), ...THEME_PLUGIN_SEGMENTS)
}

function normalizeOpacity(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.18
  }

  if (value > 1) {
    return Math.max(0, Math.min(1, value / 100))
  }

  return Math.max(0, Math.min(1, value))
}

function normalizeColor(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '#1e1e1e'
  }

  return value.trim()
}

function resolvePluginAsset(pluginDir: string, assetPath: unknown): string {
  if (typeof assetPath !== 'string' || assetPath.trim().length === 0) {
    return ''
  }

  const resolvedPath = path.isAbsolute(assetPath)
    ? assetPath
    : path.resolve(pluginDir, assetPath)

  return fs.existsSync(resolvedPath) ? resolvedPath : ''
}

function toFileUrl(filePath: string): string {
  return filePath ? pathToFileURL(filePath).toString() : ''
}

function parseThemePlugin(pluginDir: string): ThemePluginInfo | null {
  const mainJsonPath = path.join(pluginDir, 'main.json')
  if (!fs.existsSync(mainJsonPath)) {
    return null
  }

  try {
    const raw = fs.readFileSync(mainJsonPath, 'utf-8')
    const parsed = JSON.parse(raw)
    const images = parsed?.Data?.Images || {}
    const colors = parsed?.Data?.Colors || {}
    const backgroundImagePath = resolvePluginAsset(pluginDir, images.Background)
    const previewImagePath =
      resolvePluginAsset(pluginDir, images.Small) || backgroundImagePath

    return {
      id: path.basename(pluginDir),
      name: parsed?.PluginMetaData?.PluginName || path.basename(pluginDir),
      rootDir: pluginDir,
      backgroundImagePath,
      backgroundImageUrl: toFileUrl(backgroundImagePath),
      previewImagePath,
      previewImageUrl: toFileUrl(previewImagePath),
      bgColorOpacity: normalizeOpacity(parsed?.Data?.BgColorOpacity),
      windowBackground: normalizeColor(colors['Window.Background'])
    }
  } catch {
    return null
  }
}

export function getThemePlugins(): ThemePluginInfo[] {
  const plugins: ThemePluginInfo[] = []
  const seenIds = new Set<string>()

  for (const rootDir of getThemePluginCandidates()) {
    if (!fs.existsSync(rootDir)) {
      continue
    }

    const entries = fs.readdirSync(rootDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      const plugin = parseThemePlugin(path.join(rootDir, entry.name))
      if (!plugin || seenIds.has(plugin.id)) {
        continue
      }

      seenIds.add(plugin.id)
      plugins.push(plugin)
    }
  }

  return plugins
}
