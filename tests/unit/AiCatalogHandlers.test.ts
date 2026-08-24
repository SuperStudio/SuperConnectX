import { describe, expect, it, vi } from 'vitest'
import { createCommandHandlers } from '../../src/main/extensions/ai-control/application/handlers/CommandHandlers'
import { createConnectionHandlers } from '../../src/main/extensions/ai-control/application/handlers/ConnectionHandlers'
import type { ConfigPort } from '../../src/main/extensions/ai-control/ports/ConfigPort'
import type { CoreCatalog } from '../../src/main/services/types/CoreCatalog'

function configPort(revision = 1): ConfigPort {
  return {
    describe: () => [],
    get: (domain) => ({ domain, targetId: null, value: {}, revision }),
    patch: vi.fn(),
    recordExternalChange: vi.fn((domain: string, targetId: string | null) => ({
      domain,
      targetId,
      value: {},
      revision: revision + 1
    }))
  }
}

function catalog(overrides: Partial<CoreCatalog> = {}): CoreCatalog {
  return {
    listConnections: () => [],
    createConnection: () => ({}),
    updateConnection: () => ({}),
    deleteConnection: () => [],
    listCommandGroups: () => [],
    createCommandGroup: () => ({}),
    updateCommandGroup: () => ({}),
    deleteCommandGroup: () => [],
    listPresetCommands: () => [],
    createPresetCommand: () => ({}),
    updatePresetCommand: () => ({}),
    deletePresetCommand: () => [],
    ...overrides
  }
}

const context = {
  principalId: 'principal',
  clientName: 'test',
  signal: new AbortController().signal
}

describe('AI catalog handlers', () => {
  it('normalizes the existing one-element connection update result before output validation', async () => {
    const config = configPort()
    const [definition] = createConnectionHandlers(
      catalog({
        updateConnection: () => [
          { id: 1, name: 'Updated', connectionType: 'telnet', host: '127.0.0.1', port: 23 }
        ]
      }),
      config
    ).filter((item) => item.name === 'connection_update')

    const result = await definition.handler(
      {
        expectedRevision: 1,
        connection: {
          id: 1,
          name: 'Updated',
          connectionType: 'telnet',
          host: '127.0.0.1',
          port: 23
        }
      },
      context
    )

    expect(result).toMatchObject({ connection: { id: 1, name: 'Updated' }, revision: 2 })
    expect(() => definition.outputSchema.parse({ data: result })).not.toThrow()
  })

  it.each([
    ['command_group_create', { group: { name: 'Group' } }, { createCommandGroup: () => null }],
    [
      'command_group_update',
      { expectedRevision: 1, group: { groupId: 1, name: 'Group' } },
      { updateCommandGroup: () => null }
    ],
    [
      'preset_command_create',
      { command: { groupId: 1, name: 'PING', command: 'PING' } },
      { createPresetCommand: () => '' }
    ],
    [
      'preset_command_update',
      { expectedRevision: 1, command: { id: 1, groupId: 1, name: 'PING', command: 'PING' } },
      { updatePresetCommand: () => '' }
    ]
  ])(
    'maps %s storage failure to CATALOG_OPERATION_FAILED without advancing revision',
    async (name, input, override) => {
      const config = configPort()
      const definition = createCommandHandlers(
        catalog(override as Partial<CoreCatalog>),
        config
      ).find((item) => item.name === name)!

      await expect(definition.handler(input, context)).rejects.toMatchObject({
        code: 'CATALOG_OPERATION_FAILED'
      })
      expect(config.recordExternalChange).not.toHaveBeenCalled()
    }
  )
})
