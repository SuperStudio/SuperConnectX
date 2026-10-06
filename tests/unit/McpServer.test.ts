import { describe, expect, it, vi } from 'vitest'
import { createMcpServer } from '../../apps/superconnectx/src/main/mcp/McpServer'

describe('createMcpServer', () => {
  it('registers the initial read-only tool set', () => {
    const facade = {
      listSerialPorts: vi.fn(async () => [{ path: 'COM3' }]),
      listSessions: vi.fn(async () => []),
      readLogTail: vi.fn(async () => ({ sessionId: 's1', lines: ['ok'], truncated: false }))
    }
    const server = createMcpServer(facade)
    expect(server).toBeDefined()
    expect(facade.listSerialPorts).not.toHaveBeenCalled()
  })
})
