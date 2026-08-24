import { describe, expect, it } from 'vitest'
import * as z from 'zod/v4'
import AiOperationRegistry, {
  dataOutputSchema,
  operation
} from '../../src/main/extensions/ai-control/application/AiOperationRegistry'
import { createActivityHandlers } from '../../src/main/extensions/ai-control/application/handlers/ActivityHandlers'
import { createCommandHandlers } from '../../src/main/extensions/ai-control/application/handlers/CommandHandlers'
import { createConfigHandlers } from '../../src/main/extensions/ai-control/application/handlers/ConfigHandlers'
import { createConnectionHandlers } from '../../src/main/extensions/ai-control/application/handlers/ConnectionHandlers'
import { createLogHandlers } from '../../src/main/extensions/ai-control/application/handlers/LogHandlers'
import { createSerialHandlers } from '../../src/main/extensions/ai-control/application/handlers/SerialHandlers'
import { createServerHandlers } from '../../src/main/extensions/ai-control/application/handlers/ServerHandlers'
import { createSessionHandlers } from '../../src/main/extensions/ai-control/application/handlers/SessionHandlers'
import { AI_ERROR_CODES } from '../../src/main/extensions/ai-control/application/AiErrorCodes'

describe('AiOperationRegistry', () => {
  it('rejects duplicate names and carries a strict schema', () => {
    const definition = operation({
      name: 'one',
      description: 'one',
      capabilityGroup: 'sessionRead',
      access: 'read',
      inputSchema: z.object({ value: z.string() }).strict(),
      outputSchema: dataOutputSchema(z.object({ value: z.string() }).strict()),
      errorCodes: [],
      handler: async () => ({})
    })
    expect(() => new AiOperationRegistry([definition, definition])).toThrow('Duplicate')
    expect(() => definition.inputSchema.parse({ value: 'ok', extra: true })).toThrow()
  })

  it('registers the complete standard MCP operation contract from one source', () => {
    const definitions = [
      ...createServerHandlers(() => ({ instanceIndex: 0, appVersion: 'test' })),
      ...createSerialHandlers({} as never),
      ...createSessionHandlers({} as never),
      ...createLogHandlers({} as never),
      ...createConnectionHandlers({} as never, {} as never),
      ...createCommandHandlers({} as never, {} as never),
      ...createConfigHandlers({} as never),
      ...createActivityHandlers({} as never)
    ]
    const registry = new AiOperationRegistry(definitions)
    expect(
      registry
        .list()
        .map((item) => item.name)
        .sort()
    ).toEqual(
      [
        'activity_read',
        'command_group_create',
        'command_group_delete',
        'command_group_list',
        'command_group_update',
        'config_describe',
        'config_get',
        'config_patch',
        'connection_create',
        'connection_delete',
        'connection_list',
        'connection_update',
        'log_read_tail',
        'log_search',
        'preset_command_create',
        'preset_command_delete',
        'preset_command_list',
        'preset_command_update',
        'serial_list_ports',
        'server_get_info',
        'session_acquire_write',
        'session_list',
        'session_read_buffer',
        'session_read_events',
        'session_release_write',
        'session_send',
        'session_send_and_wait',
        'session_start_port',
        'session_start_saved',
        'session_stop',
        'session_wait_events',
        'session_wait_pattern'
      ].sort()
    )
    for (const definition of registry.list()) {
      expect(definition.deadlineMs).toBeGreaterThan(0)
      expect(definition.annotations).toMatchObject({
        readOnlyHint: definition.access === 'read',
        openWorldHint: false
      })
      expect(typeof definition.handler).toBe('function')
      expect(definition.inputSchema).toBeDefined()
      expect(definition.outputSchema).toBeDefined()
      expect(definition.errorCodes.length).toBeGreaterThan(0)
      expect(definition.outputSchema.safeParse({ data: null }).success).toBe(false)
      for (const code of definition.errorCodes) {
        expect(Object.values(AI_ERROR_CODES)).toContain(code)
      }
    }
  })
})
