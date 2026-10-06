import { cp, mkdir, access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'

const SKILL_NAME = 'superconnectx-mcp'

function skillSourceCandidates(): string[] {
  return [
    join(process.resourcesPath, 'mcp', 'skill'),
    join(app.getAppPath(), 'resources', 'mcp', 'skill'),
    join(app.getAppPath(), 'packages', 'superconnectx-mcp-skill'),
    join(process.cwd(), 'resources', 'mcp', 'skill'),
    join(process.cwd(), 'packages', 'superconnectx-mcp-skill')
  ]
}

async function resolveSkillSource(): Promise<string> {
  for (const candidate of skillSourceCandidates()) {
    try {
      await access(join(candidate, 'SKILL.md'))
      return candidate
    } catch {
      // try next
    }
  }
  throw new Error('未找到内置 MCP Skill 文件')
}

export function getSkillInstallTargets(): Array<{ id: string; path: string }> {
  const home = homedir()
  return [
    { id: 'agents', path: join(home, '.agents', 'skills', SKILL_NAME) },
    { id: 'codex', path: join(home, '.codex', 'skills', SKILL_NAME) }
  ]
}

export function getSkillInstallCommands(): { gitClone: string; cliInstall: string; symlink: string } {
  return {
    gitClone: [
      'git clone --depth 1 --filter=blob:none --sparse https://github.com/SuperStudio/SuperConnectX.git scx-tmp',
      'cd scx-tmp && git sparse-checkout set packages/superconnectx-mcp-skill',
      'mkdir -p ~/.agents/skills && rm -rf ~/.agents/skills/superconnectx-mcp',
      'cp -R packages/superconnectx-mcp-skill ~/.agents/skills/superconnectx-mcp'
    ].join('\n'),
    cliInstall: ['bash scripts/install-mcp-cli.sh', 'export PATH="$HOME/.local/bin:$PATH"', 'scx-mcp --doctor', 'scx-mcp --print-config'].join('\n'),
    symlink:
      'ln -sfn /path/to/SuperConnectX/packages/superconnectx-mcp-skill ~/.agents/skills/superconnectx-mcp'
  }
}

export async function installBundledMcpSkill(): Promise<{
  source: string
  installed: Array<{ id: string; path: string }>
}> {
  const source = await resolveSkillSource()
  const installed: Array<{ id: string; path: string }> = []
  for (const target of getSkillInstallTargets()) {
    await mkdir(join(target.path, '..'), { recursive: true })
    await cp(source, target.path, { recursive: true, force: true })
    installed.push(target)
  }
  return { source, installed }
}
