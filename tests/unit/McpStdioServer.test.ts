import { describe, expect, it, vi } from 'vitest'
import { startMcpStdioServer } from '../../apps/superconnectx/src/main/mcp/McpStdioServer'

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {
    async start() {}
    async close() {}
  }
}))

describe('McpStdioServer', () => {
  it('creates the shared MCP server and returns a close function', async () => {
    const close = await startMcpStdioServer({ listSerialPorts: vi.fn(async () => []), listSessions: vi.fn(async () => []), readLogTail: vi.fn() })
    expect(close).toBeTypeOf('function')
    await close()
  })
})
