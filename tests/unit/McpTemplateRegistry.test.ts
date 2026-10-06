import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { McpTemplateRegistry } from '../../apps/superconnectx/src/main/mcp/McpTemplateRegistry'

const template = {
  id: 'demo.device',
  version: 1,
  name: 'Demo Device',
  connectionTypes: ['serial'],
  permissions: { defaultMode: 'read-only', allowWrite: false },
  commands: [{ id: 'version', label: '版本', text: 'AT+VERSION', risk: 'read' }],
  logEvents: [{ id: 'reboot', level: 'warning', pattern: 'watchdog', summary: '看门狗复位' }]
}

describe('McpTemplateRegistry', () => {
  it('registers, lists and retrieves validated templates', () => {
    const registry = new McpTemplateRegistry()
    registry.register(template)
    expect(registry.list()).toEqual([{ id: 'demo.device', version: 1, name: 'Demo Device' }])
    expect(registry.get('demo.device')?.commands[0].text).toBe('AT+VERSION')
  })

  it('rejects a version downgrade', () => {
    const registry = new McpTemplateRegistry()
    registry.register(template)
    expect(() => registry.register({ ...template, version: 0 })).toThrow()
  })

  it('rejects executable-looking invalid template identifiers', () => {
    const registry = new McpTemplateRegistry()
    expect(() => registry.register({ ...template, id: '../evil' })).toThrow()
  })

  it('loads JSON templates and skips invalid files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'scx-mcp-'))
    try {
      await writeFile(join(directory, 'valid.json'), JSON.stringify({ ...template, id: 'router.demo' }))
      await writeFile(join(directory, 'invalid.json'), '{not-json')
      await writeFile(join(directory, 'notes.txt'), 'ignored')
      const result = await new McpTemplateRegistry().loadDirectory(directory)
      expect(result.loaded).toHaveLength(1)
      expect(result.loaded[0].id).toBe('router.demo')
      expect(result.skipped).toHaveLength(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('treats a missing directory as empty', async () => {
    await expect(new McpTemplateRegistry().loadDirectory('/path/that/does/not/exist')).resolves.toEqual({ loaded: [], skipped: [] })
  })
})
