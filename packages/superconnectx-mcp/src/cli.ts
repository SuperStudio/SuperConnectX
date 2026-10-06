#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { startMcpStdio, McpLoopbackServer } from './transports.js'
import type { McpFacade, McpPermissionPolicy } from './types.js'
import { NativeMcpFacade } from './native-facade.js'
import { TemplateRegistry } from './templates.js'
import { createDefaultAuditSink } from './audit.js'
import { expandDirectoryComponents, facadeComponent, initDeveloperProfile, loadDeveloperProfile, scaffoldDeveloperFile } from './developer-profile.js'

function usage(message?: string): never {
  if (message) console.error(message)
  console.error(
    'Usage: scx-mcp [--init [DIR]] [--new template|tool|parser 名称] [--facade ./facade.mjs] [--stdio | --http] [--port 32180] [--token TOKEN] [--mode read-only|read-write|full] [--allow-export|--no-export] [--templates DIR] [--doctor] [--print-config]'
  )
  process.exit(2)
}

function parsePolicy(argv: string[]): { mode: 'read-only' | 'read-write' | 'full'; policy: McpPermissionPolicy } {
  const value = (name: string) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const mode = (value('--mode') ?? 'full') as 'read-only' | 'read-write' | 'full'
  if (!['read-only', 'read-write', 'full'].includes(mode)) usage(`Invalid --mode: ${mode}`)
  return {
    mode,
    policy: {
      read: true,
      write: mode !== 'read-only',
      destructive: mode === 'full',
      export: mode === 'full' && (!argv.includes('--no-export') || argv.includes('--allow-export'))
    }
  }
}

export async function runMcpCli(argv = process.argv.slice(2)): Promise<void> {
  const value = (name: string) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }

  if (argv.includes('--help') || argv.includes('-h')) usage()
  if (argv.includes('--version')) {
    console.log('0.1.0')
    return
  }
  if (argv.includes('--init')) {
    const index = argv.indexOf('--init')
    const root = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : undefined
    const profilePath = await initDeveloperProfile(root)
    console.log(`已创建 ${profilePath}`)
    console.log('把文件放进同级 templates resources scripts parsers tools 目录，然后运行 scx-mcp --doctor')
    return
  }
  if (argv.includes('--new')) {
    const index = argv.indexOf('--new')
    const kind = argv[index + 1]
    const flags = new Set(['--dir'])
    const name = argv.slice(index + 2).filter((item, offset, items) => !item.startsWith('--') && !flags.has(items[offset - 1] ?? '')).join(' ')
    const root = argv[argv.indexOf('--dir') + 1]
    if (!kind || !name) usage('--new 需要类型和名称，例如 --new template 我的设备, version, status')
    console.log(await scaffoldDeveloperFile(kind, name, argv.includes('--dir') ? root : undefined))
    return
  }

  const { mode, policy } = parsePolicy(argv)
  const registry = new TemplateRegistry()
  const profile = await loadDeveloperProfile(registry, value('--profile'))
  const components = await expandDirectoryComponents(profile?.components ?? [])
  const defaultTemplates = join(homedir(), '.superconnectx', 'templates')
  const templateDirectory = value('--templates') ?? process.env.SCX_MCP_TEMPLATES ?? defaultTemplates
  const templateResult = await registry.loadDirectory(templateDirectory)
  const facadePath = facadeComponent(profile, value('--facade') ?? process.env.SCX_MCP_FACADE_MODULE)

  if (argv.includes('--doctor')) {
    const probe = new NativeMcpFacade(registry)
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode,
          profile: profile?.source ?? null,
          profileId: profile?.profile.id ?? null,
          components: components.map((item) => ({ id: item.id, type: item.type, path: item.path })),
          templateDirectory,
          templates: registry.list().length,
          skippedTemplates: [...templateResult.skipped, ...(profile?.skipped ?? [])],
          serialPorts: await probe.listSerialPorts(),
          facade: facadePath ?? 'native'
        },
        null,
        2
      )
    )
    return
  }

  if (argv.includes('--print-config')) {
    const command = ['scx-mcp', '--stdio', '--mode', mode]
    if (argv.includes('--no-export')) command.push('--no-export')
    if (argv.includes('--allow-export')) command.push('--allow-export')
    if (facadePath) command.push('--facade', facadePath)
    if (templateDirectory !== defaultTemplates) command.push('--templates', templateDirectory)
    console.log(
      JSON.stringify(
        {
          mcpServers: {
            superconnectx: {
              command: command[0],
              args: command.slice(1)
            }
          }
        },
        null,
        2
      )
    )
    return
  }

  let resolvedFacade: McpFacade
  if (facadePath) {
    const imported = await import(pathToFileURL(facadePath).href)
    resolvedFacade = (imported.default ?? imported.facade) as McpFacade
  } else {
    resolvedFacade = new NativeMcpFacade(registry)
  }
  if (!resolvedFacade || typeof resolvedFacade.listSerialPorts !== 'function') {
    throw new Error('Facade module must export default or facade implementing McpFacade')
  }

  const audit = createDefaultAuditSink()

  if (argv.includes('--http')) {
    const server = new McpLoopbackServer(
      resolvedFacade,
      value('--token') ?? process.env.SCX_MCP_TOKEN,
      policy,
      audit,
      components
    )
    await server.start(Number(value('--port') ?? process.env.SCX_MCP_PORT ?? 32180))
    console.error(`SuperConnectX MCP listening at ${server.endpoint}`)
    await new Promise<void>((resolve) => {
      process.once('SIGINT', () => {
        void server.close().then(() => resolve())
      })
    })
    return
  }

  await startMcpStdio(resolvedFacade, policy, audit, components)
}

const isDirectExecution =
  process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  runMcpCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
