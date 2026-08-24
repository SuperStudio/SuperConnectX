import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import net from 'net'
import { createMcpTestHarness, type McpTestHarness } from './helpers/mcpTestServer'

describe('MCP HTTP security', () => {
  let harness: McpTestHarness
  beforeEach(async () => {
    harness = await createMcpTestHarness()
  })
  afterEach(async () => {
    await harness.close()
  })

  it('rejects missing and invalid bearer credentials', async () => {
    expect(
      (
        await fetch(harness.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}'
        })
      ).status
    ).toBe(401)
    expect(
      (
        await fetch(harness.endpoint, {
          method: 'POST',
          headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
          body: '{}'
        })
      ).status
    ).toBe(401)
  })

  it('rejects hostile Host, Origin and CORS preflight requests', async () => {
    const authorization = `Bearer ${harness.token}`
    expect(
      (
        await fetch(harness.endpoint, {
          method: 'POST',
          headers: { authorization, host: 'evil.example', 'content-type': 'application/json' },
          body: '{}'
        })
      ).status
    ).toBeGreaterThanOrEqual(400)
    expect(
      (
        await fetch(harness.endpoint, {
          method: 'POST',
          headers: {
            authorization,
            origin: 'https://evil.example',
            'content-type': 'application/json'
          },
          body: '{}'
        })
      ).status
    ).toBe(403)
    expect(
      (await fetch(harness.endpoint, { method: 'OPTIONS', headers: { authorization } })).status
    ).toBe(405)
  })

  it('enforces the one MiB JSON body limit', async () => {
    const response = await fetch(harness.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${harness.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(1024 * 1024) })
    })
    expect(response.status).toBe(413)
  })

  it('reports a fixed-port conflict without choosing a random fallback', async () => {
    await harness.close()
    const occupied = net.createServer()
    await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve))
    const address = occupied.address()
    const port = typeof address === 'object' && address ? address.port : 0
    harness = await createMcpTestHarness({ port, expectedState: 'port_conflict' })
    expect(harness.manager.getStatus()).toMatchObject({ state: 'port_conflict', port })
    await new Promise<void>((resolve) => occupied.close(() => resolve()))
  })
})
