import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { z } from 'zod'
import { templateSchema, type TemplateRegistry } from './templates.js'

const componentSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  type: z.enum(['template-dir', 'resource-dir', 'script-dir', 'parser', 'tool', 'facade']),
  description: z.string().max(500).optional(),
  path: z.string().min(1).max(1000),
  risk: z.enum(['read', 'write', 'destructive', 'export']).default('read')
})

export const developerProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  name: z.string().min(1).max(120),
  version: z.number().int().positive(),
  description: z.string().max(1000).optional(),
  templates: z.array(templateSchema).max(200).default([]),
  components: z.array(componentSchema).max(200).default([])
})

export type DeveloperProfile = z.infer<typeof developerProfileSchema>
export type DeveloperComponent = z.infer<typeof componentSchema>

export interface DeveloperProfileLoadResult {
  profile: DeveloperProfile
  source: string
  loadedTemplates: Array<{ id: string; version: number; source: string }>
  components: Array<{ id: string; type: DeveloperComponent['type']; path: string; risk: DeveloperComponent['risk'] }>
  skipped: Array<{ source: string; reason: string }>
}

export function developerProfilePaths(explicitPath?: string): string[] {
  const paths = [
    explicitPath,
    process.env.SCX_MCP_PROFILE,
    join(process.cwd(), '.superconnectx', 'profile.json'),
    join(homedir(), '.superconnectx', 'profile.json')
  ].filter((value): value is string => Boolean(value))
  return [...new Set(paths.map((value) => resolve(value)))]
}

function resolveFrom(baseFile: string, value: string): string {
  const expanded = value.startsWith('~/') ? join(homedir(), value.slice(2)) : value
  return isAbsolute(expanded) ? expanded : resolve(baseFile, '..', expanded)
}
export async function loadDeveloperProfile(
  registry: TemplateRegistry,
  explicitPath?: string
): Promise<DeveloperProfileLoadResult | null> {
  const source = await firstExisting(developerProfilePaths(explicitPath))
  if (!source) return null
  const profile = developerProfileSchema.parse(JSON.parse(await readFile(source, 'utf8')))
  const result: DeveloperProfileLoadResult = { profile, source, loadedTemplates: [], components: [], skipped: [] }

  for (const template of profile.templates) {
    try {
      registry.register(template)
      result.loadedTemplates.push({ id: template.id, version: template.version, source })
    } catch (error) {
      result.skipped.push({ source: `${source}#${template.id}`, reason: errorMessage(error) })
    }
  }

  for (const component of profile.components) {
    const componentPath = resolveFrom(source, component.path)
    if (component.type === 'template-dir' || component.type === 'parser' || component.type === 'tool') {
      const loaded = component.type === 'template-dir'
        ? await registry.loadDirectory(componentPath).catch(() => ({ loaded: [], skipped: [] }))
        : { loaded: [], skipped: [] }
      result.loadedTemplates.push(...loaded.loaded.map((item) => ({ id: item.id, version: item.version, source: item.file })))
      result.skipped.push(...loaded.skipped.map((item) => ({ source: item.file, reason: item.reason })))
      result.components.push({ id: component.id, type: component.type, path: componentPath, risk: component.risk })
      continue
    }
    try {
      await access(componentPath)
      result.components.push({ id: component.id, type: component.type, path: componentPath, risk: component.risk })
    } catch (error) {
      result.skipped.push({ source: componentPath, reason: errorMessage(error) })
    }
  }
  return result
}

export function facadeComponent(result: DeveloperProfileLoadResult | null, explicitFacade?: string): string | undefined {
  if (explicitFacade) return explicitFacade
  const component = result?.profile.components.find((item) => item.type === 'facade')
  return component && result ? resolveFrom(result.source, component.path) : undefined
}

const FOLDER_COMPONENTS = [
  ['templates', 'template-dir'],
  ['resources', 'resource-dir'],
  ['scripts', 'script-dir'],
  ['parsers', 'parser'],
  ['tools', 'tool']
] as const

export async function initDeveloperProfile(root = join(homedir(), '.superconnectx')): Promise<string> {
  const dirs = FOLDER_COMPONENTS.map(([name]) => join(root, name))
  await Promise.all(dirs.map((dir) => mkdir(dir, { recursive: true })))
  const profilePath = join(root, 'profile.json')
  const profile = {
    id: 'my.device',
    name: '我的设备包',
    version: 1,
    templates: [],
    components: FOLDER_COMPONENTS.map(([name, type]) => ({ id: name, type, path: name }))
  }
  await writeFile(profilePath, JSON.stringify(profile, null, 2) + '\n')
  await writeFile(join(root, 'templates', 'README.md'), '把设备模板 JSON 放在这里。文件名就是模板，不用改 profile.json。\n')
  await writeFile(join(root, 'parsers', 'README.md'), '把解析器 .mjs 放在这里。文件名就是工具名，导出 default async function。\n')
  await writeFile(join(root, 'tools', 'README.md'), '把自定义工具 .mjs 放在这里。文件名就是工具名，导出 default async function。\n')
  return profilePath
}

export async function scaffoldDeveloperFile(kind: string, name: string, root = join(homedir(), '.superconnectx')): Promise<string> {
  const safeName = name.split(',')[0].trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._\-\u4e00-\u9fff]/g, '').replace(/^-+|-+$/g, '')
  if (!safeName) throw new Error('名称只能包含字母、数字、点、下划线和连字符')
  await initDeveloperProfile(root)
  if (kind === 'template') {
    const file = join(root, 'templates', `${safeName}.json`)
    const commands = name.split(',').slice(1).map((item) => item.trim()).filter(Boolean)
    await writeFile(file, JSON.stringify({ name: name.split(',')[0].trim(), commands: commands.map((command) => command.split(/\s+/)[0]) }, null, 2) + '\n')
    return file
  }
  if (kind !== 'tool' && kind !== 'parser') throw new Error('只能新建 template、tool 或 parser')
  const file = join(root, kind === 'tool' ? 'tools' : 'parsers', `${safeName}.mjs`)
  await writeFile(file, [
    'export default async function ({ facade, input }) {',
    '  const text = await facade.readSession?.(input.sessionId)',
    '  return { text, input }',
    '}',
    ''
  ].join('\n'))
  return file
}

export async function expandDirectoryComponents(components: DeveloperComponent[]): Promise<DeveloperComponent[]> {
  const expanded: DeveloperComponent[] = []
  for (const component of components) {
    if (component.type !== 'parser' && component.type !== 'tool') {
      expanded.push(component)
      continue
    }
    let entries: string[]
    try {
      entries = (await readdir(component.path, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && /\.mjs$/i.test(entry.name) && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort()
    } catch {
      expanded.push(component)
      continue
    }
    if (entries.length === 0) {
      expanded.push(component)
      continue
    }
    for (const name of entries) {
      const id = `${component.id}.${name.replace(/\.mjs$/i, '').replace(/[^a-z0-9._-]/gi, '-').toLowerCase()}`
      expanded.push({ ...component, id, path: join(component.path, name) })
    }
  }
  return expanded
}

async function firstExisting(paths: string[]): Promise<string | undefined> {
  for (const path of paths) {
    try {
      await access(path)
      return path
    } catch {
      // try next
    }
  }
  return undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
