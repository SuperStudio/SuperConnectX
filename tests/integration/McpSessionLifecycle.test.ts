import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { createMcpTestHarness, type McpTestHarness } from './helpers/mcpTestServer'

describe('MCP session lifecycle', () => {
  let harness: McpTestHarness
  const clients: Client[] = []
  beforeEach(async () => {
    harness = await createMcpTestHarness()
  })
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)))
    await harness.close()
  })

  it('initializes independent clients and removes them on DELETE/close', async () => {
    clients.push(await harness.connect('client-one'), await harness.connect('client-two'))
    expect(harness.manager.getStatus().clientCount).toBe(2)
    expect(
      harness.manager
        .getStatus()
        .clients.map((client) => client.name)
        .sort()
    ).toEqual(['client-one', 'client-two'])
    await harness.terminate(clients[0])
    await clients[0].close()
    clients.shift()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(harness.manager.getStatus().clientCount).toBe(1)
  })

  it('rejects unknown sessions and invalidates existing sessions after token rotation', async () => {
    const unknown = await fetch(harness.endpoint, {
      method: 'GET',
      headers: { authorization: `Bearer ${harness.token}`, 'mcp-session-id': 'missing' }
    })
    expect(unknown.status).toBe(404)
    const client = await harness.connect('rotated-client')
    clients.push(client)
    await harness.storage.rotateToken(0)
    await harness.manager.invalidateSessions()
    expect(harness.manager.getStatus().clientCount).toBe(0)
    await expect(client.listTools()).rejects.toThrow()
  })

  it('passes the official SDK loopback self-test', async () => {
    const observedClientCounts: number[] = []
    const release = harness.manager.onStateChanged((status) =>
      observedClientCounts.push(status.clientCount)
    )
    await expect(harness.manager.runSelfTest()).resolves.toMatchObject({
      success: true,
      toolCount: 4
    })
    release()
    expect(observedClientCounts.every((count) => count === 0)).toBe(true)
  })
})
