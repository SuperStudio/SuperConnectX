import { expect, test } from '@playwright/test'
import net, { type Server } from 'net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { closeApp, launchApp } from './helpers'

async function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  })
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

async function waitUntilPortIsReusable(port: number): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const probe = net.createServer()
    try {
      await new Promise<void>((resolve, reject) => {
        probe.once('error', reject)
        probe.listen(port, '127.0.0.1', () => resolve())
      })
      await closeServer(probe)
      return
    } catch (error) {
      lastError = error
      await closeServer(probe).catch(() => undefined)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw lastError
}

test('同一写工作流可跨三条 MCP Session 完成 Telnet 启动、发送与停止', async () => {
  const echoServer = net.createServer((socket) => {
    socket.on('data', (data) => {
      if (data.toString('utf8').includes('PING')) socket.write('PONG\r\n')
    })
  })
  const telnetPort = await listen(echoServer)
  const mcpProbe = net.createServer()
  const mcpPort = await listen(mcpProbe)
  await closeServer(mcpProbe)

  const { app, page, userDataDir } = await launchApp()
  const clients: Client[] = []
  const transports: StreamableHTTPClientTransport[] = []
  let appClosed = false

  const connect = async (name: string, token: string): Promise<Client> => {
    const client = new Client({ name, version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${mcpPort}/mcp`),
      { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
    )
    await client.connect(transport)
    clients.push(client)
    transports.push(transport)
    return client
  }

  try {
    await page.evaluate(async (port) => {
      const config = await window.aiServiceApi.getConfig()
      await window.aiServiceApi.saveConfig({
        expectedRevision: config.revision,
        instance: { enabled: true, portOverride: port }
      })
      await window.aiServiceApi.setPermission('full-control')
    }, mcpPort)

    await expect
      .poll(() => page.evaluate(async () => (await window.aiServiceApi.getState()).state))
      .toBe('running')
    const copiedConfig = await page.evaluate(() => window.aiServiceApi.getCodexConfig())
    const token = copiedConfig.match(/Authorization = "Bearer ([^"]+)"/)?.[1]
    expect(token).toBeTruthy()

    const selfTest = await page.evaluate(() => window.aiServiceApi.runSelfTest())
    expect(selfTest.success).toBe(true)
    await expect
      .poll(() => page.evaluate(async () => (await window.aiServiceApi.getState()).clientCount))
      .toBe(0)

    const starter = await connect('lease-e2e-starter', token!)
    const sender = await connect('lease-e2e-sender', token!)
    const stopper = await connect('lease-e2e-stopper', token!)

    const created = await starter.callTool({
      name: 'connection_create',
      arguments: {
        connection: {
          name: 'MCP Lease E2E Telnet',
          connectionType: 'telnet',
          host: '127.0.0.1',
          port: telnetPort,
          autoReconnect: false
        }
      }
    })
    const createdData = (
      created.structuredContent as {
        data: { connection: { id: number }; revision: number }
      }
    ).data

    const started = await starter.callTool({
      name: 'session_start_saved',
      arguments: { connectionId: createdData.connection.id }
    })
    const startedData = (
      started.structuredContent as { data: { sessionId: string; writeLeaseId: string } }
    ).data
    expect(startedData.writeLeaseId).toHaveLength(43)
    await expect(page.locator('.tab-item').filter({ hasText: 'MCP Lease E2E Telnet' })).toHaveCount(
      1
    )

    const rejected = await sender.callTool({
      name: 'session_send',
      arguments: { sessionId: startedData.sessionId, text: 'UNAUTHORIZED' }
    })
    expect(rejected).toMatchObject({
      isError: true,
      structuredContent: { data: { error: { code: 'SESSION_WRITE_LOCKED' } } }
    })

    const sent = await sender.callTool({
      name: 'session_send_and_wait',
      arguments: {
        sessionId: startedData.sessionId,
        writeLeaseId: startedData.writeLeaseId,
        text: 'PING',
        pattern: 'PONG',
        timeoutMs: 5_000
      }
    })
    expect(sent).toMatchObject({
      structuredContent: {
        data: {
          writeLeaseId: startedData.writeLeaseId,
          sent: { accepted: true },
          observed: { matched: true }
        }
      }
    })

    const stopped = await stopper.callTool({
      name: 'session_stop',
      arguments: {
        sessionId: startedData.sessionId,
        writeLeaseId: startedData.writeLeaseId
      }
    })
    expect(stopped).toMatchObject({
      structuredContent: { data: { success: true } }
    })
    await expect(page.locator('.tab-item').filter({ hasText: 'MCP Lease E2E Telnet' })).toHaveCount(
      0
    )
    await expect(stopper.callTool({ name: 'session_list', arguments: {} })).resolves.toMatchObject({
      structuredContent: { data: { sessions: [] } }
    })

    await expect(
      stopper.callTool({
        name: 'connection_delete',
        arguments: {
          connectionId: createdData.connection.id,
          expectedRevision: createdData.revision
        }
      })
    ).resolves.toMatchObject({
      structuredContent: { data: { connections: [] } }
    })

    for (const transport of transports) await transport.terminateSession().catch(() => undefined)
    for (const client of clients) await client.close().catch(() => undefined)
    await closeApp(app, userDataDir)
    appClosed = true
    await waitUntilPortIsReusable(mcpPort)
  } finally {
    for (const transport of transports) await transport.terminateSession().catch(() => undefined)
    for (const client of clients) await client.close().catch(() => undefined)
    if (!appClosed) await closeApp(app, userDataDir)
    await closeServer(echoServer).catch(() => undefined)
  }
})
