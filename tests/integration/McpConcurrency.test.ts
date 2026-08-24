import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { createMcpTestHarness, type McpTestHarness } from './helpers/mcpTestServer'

describe('MCP concurrency', () => {
  let harness: McpTestHarness
  const clients: Client[] = []
  beforeEach(async () => {
    harness = await createMcpTestHarness()
  })
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)))
    await harness.close()
  })

  it('serves two independent MCP clients concurrently', async () => {
    clients.push(await harness.connect('concurrent-one'), await harness.connect('concurrent-two'))
    const results = await Promise.all(
      clients.map((client, index) =>
        client.callTool({
          name: 'test_echo',
          arguments: { text: `client-${index}`, delayMs: 80 }
        })
      )
    )
    expect(results.map((result) => result.structuredContent)).toEqual([
      { data: { text: 'client-0' } },
      { data: { text: 'client-1' } }
    ])
    expect(harness.calls.maximum).toBe(2)
  })

  it('allows only one real MCP client to hold a business session write lease', async () => {
    await harness.close()
    harness = await createMcpTestHarness({ withSessionHandlers: true })
    const first = await harness.connect('lease-one')
    const second = await harness.connect('lease-two')
    clients.push(first, second)

    await expect(
      first.callTool({
        name: 'session_acquire_write',
        arguments: { sessionId: 'shared-session' }
      })
    ).resolves.toMatchObject({
      structuredContent: { data: { sessionId: 'shared-session' } }
    })
    await expect(
      second.callTool({
        name: 'session_acquire_write',
        arguments: { sessionId: 'shared-session' }
      })
    ).resolves.toMatchObject({
      isError: true,
      structuredContent: { data: { error: { code: 'SESSION_WRITE_LOCKED' } } }
    })

    await harness.terminate(first)
    await first.close()
    clients.splice(clients.indexOf(first), 1)
    await expect.poll(() => harness.manager.getStatus().clientCount).toBe(1)
    await expect(
      second.callTool({
        name: 'session_acquire_write',
        arguments: { sessionId: 'shared-session' }
      })
    ).resolves.toMatchObject({
      structuredContent: { data: { sessionId: 'shared-session' } }
    })
  })

  it('continues the same write workflow across MCP sessions with writeLeaseId', async () => {
    await harness.close()
    harness = await createMcpTestHarness({ withSessionHandlers: true })
    const first = await harness.connect('workflow-transport-one')
    const second = await harness.connect('workflow-transport-two')
    clients.push(first, second)

    const acquired = await first.callTool({
      name: 'session_acquire_write',
      arguments: { sessionId: 'shared-session' }
    })
    const writeLeaseId = (acquired.structuredContent as { data: { writeLeaseId: string } }).data
      .writeLeaseId
    expect(writeLeaseId).toHaveLength(43)

    await expect(
      second.callTool({
        name: 'session_send',
        arguments: { sessionId: 'shared-session', text: 'RESUME', writeLeaseId }
      })
    ).resolves.toMatchObject({
      structuredContent: {
        data: { accepted: true, sessionId: 'shared-session', writeLeaseId }
      }
    })

    await expect(
      first.callTool({
        name: 'session_send',
        arguments: { sessionId: 'shared-session', text: 'STALE' }
      })
    ).resolves.toMatchObject({
      isError: true,
      structuredContent: { data: { error: { code: 'SESSION_WRITE_LOCKED' } } }
    })

    await expect(
      first.callTool({
        name: 'session_release_write',
        arguments: { sessionId: 'shared-session', writeLeaseId }
      })
    ).resolves.toMatchObject({
      structuredContent: { data: { sessionId: 'shared-session', released: true } }
    })
  })

  it('opens, sends and stops one serial session across three MCP transports', async () => {
    await harness.close()
    harness = await createMcpTestHarness({
      withSessionHandlers: true,
      withSessionLifecycle: true
    })
    const starter = await harness.connect('logical-ai-start')
    const sender = await harness.connect('logical-ai-send')
    const stopper = await harness.connect('logical-ai-stop')
    clients.push(starter, sender, stopper)

    const started = await starter.callTool({
      name: 'session_start_port',
      arguments: { portPath: 'COM80', baudRate: 9600 }
    })
    const startData = (
      started.structuredContent as {
        data: { sessionId: string; writeLeaseId: string }
      }
    ).data

    await expect(
      sender.callTool({
        name: 'session_send',
        arguments: {
          sessionId: startData.sessionId,
          text: 'ls',
          writeLeaseId: startData.writeLeaseId
        }
      })
    ).resolves.toMatchObject({
      structuredContent: {
        data: {
          accepted: true,
          sessionId: startData.sessionId,
          writeLeaseId: startData.writeLeaseId
        }
      }
    })

    await expect(
      stopper.callTool({
        name: 'session_stop',
        arguments: {
          sessionId: startData.sessionId,
          writeLeaseId: startData.writeLeaseId
        }
      })
    ).resolves.toMatchObject({
      structuredContent: { data: { success: true, sessionId: startData.sessionId } }
    })

    await expect(stopper.callTool({ name: 'session_list', arguments: {} })).resolves.toMatchObject({
      structuredContent: { data: { sessions: [] } }
    })
  })

  it('serializes a GUI write and a real MCP session_send through one scheduler', async () => {
    await harness.close()
    harness = await createMcpTestHarness({ withSessionHandlers: true })
    const client = await harness.connect('gui-ai-queue')
    clients.push(client)
    let releaseGui!: () => void
    const guiGate = new Promise<void>((resolve) => {
      releaseGui = resolve
    })

    const gui = harness.runGuiWrite(() => guiGate)
    await expect.poll(() => harness.sessionCalls.order).toContain('gui:start')
    const ai = client.callTool({
      name: 'session_send',
      arguments: { sessionId: 'shared-session', text: 'PING' }
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(harness.sessionCalls.order).not.toContain('ai:PING:start')
    releaseGui()
    await gui
    await expect(ai).resolves.toMatchObject({
      structuredContent: { data: { accepted: true, sessionId: 'shared-session' } }
    })
    expect(harness.sessionCalls.maximum).toBe(1)
    expect(harness.sessionCalls.order).toEqual([
      'gui:start',
      'gui:end',
      'ai:PING:start',
      'ai:PING:end'
    ])
  })

  it('uses the current GUI-synchronized command settings for the next MCP send', async () => {
    await harness.close()
    harness = await createMcpTestHarness({ withSessionHandlers: true })
    const client = await harness.connect('runtime-settings')
    clients.push(client)
    harness.setSessionSettings({
      autoNewline: true,
      hexMode: false,
      crcEnabled: false,
      crcMethod: 'CRC-16/MODBUS'
    })

    await client.callTool({
      name: 'session_send',
      arguments: { sessionId: 'shared-session', text: 'PING' }
    })
    expect(harness.sessionCalls.order).toContain('ai:PING\r\n:start')
  })
})
