import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { createMcpTestHarness, type McpTestHarness } from './helpers/mcpTestServer'

describe('MCP tools contract', () => {
  let harness: McpTestHarness
  let client: Client
  beforeEach(async () => {
    harness = await createMcpTestHarness()
    client = await harness.connect()
  })
  afterEach(async () => {
    await client.close().catch(() => undefined)
    await harness.close()
  })

  it('discovers and calls strict tools with text and structured results', async () => {
    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['server_get_info', 'test_echo'])
    )
    const result = await client.callTool({ name: 'test_echo', arguments: { text: 'hello' } })
    expect(result.structuredContent).toEqual({ data: { text: 'hello' } })
    expect(result.content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'text' })])
    )
  })

  it('reports schema violations through the MCP protocol', async () => {
    await expect(
      client.callTool({ name: 'test_echo', arguments: { text: 'ok', unexpected: true } })
    ).resolves.toMatchObject({ isError: true })
  })

  it('keeps structured business errors valid after tools/list caches output validators', async () => {
    const tools = await client.listTools()
    const failureTool = tools.tools.find((tool) => tool.name === 'test_failure')
    expect(failureTool?.outputSchema).toMatchObject({
      properties: { data: { anyOf: expect.any(Array) } }
    })

    await expect(client.callTool({ name: 'test_failure', arguments: {} })).resolves.toMatchObject({
      isError: true,
      structuredContent: {
        data: {
          error: {
            code: 'CONFIG_SCOPE_DENIED',
            message: 'AI security configuration is not exposed',
            retryable: false
          }
        }
      }
    })
  })

  it('keeps permission out of persistent config and gates write tools at runtime', async () => {
    expect('permission' in harness.config.get().shared).toBe(false)

    harness.manager.setPermission('read-only')
    await expect
      .poll(async () => (await client.listTools()).tools.map((tool) => tool.name))
      .not.toContain('test_write')

    harness.manager.setPermission('full-control')
    await expect
      .poll(async () => (await client.listTools()).tools.map((tool) => tool.name))
      .toContain('test_write')
    await expect(client.callTool({ name: 'test_write', arguments: {} })).resolves.toMatchObject({
      structuredContent: { data: { accepted: true } }
    })
  })
})
