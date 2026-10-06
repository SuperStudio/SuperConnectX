import http from 'node:http'
import { describe, expect, it } from 'vitest'
import McpHttpServer from '../../apps/superconnectx/src/main/mcp/McpHttpServer'

function request(
  port: number,
  token: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const body = options.body === undefined ? undefined : JSON.stringify(options.body)
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/mcp',
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.headers ?? {})
      }
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString('utf8'),
        headers: res.headers
      }))
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

describe('McpHttpServer', () => {
  it('binds loopback and rejects invalid auth/origin/host requests', async () => {
    const facade = {
      listSerialPorts: async () => [],
      listSessions: async () => [],
      readLogTail: async () => ({ sessionId: 's', lines: [], truncated: false })
    }
    const server = new McpHttpServer(facade, 'test-token')
    const info = await server.start(1023).catch(() => null)
    expect(info).toBeNull()

    const running = new McpHttpServer(facade, 'test-token')
    expect(running.status).toEqual({ enabled: false, port: null, endpoint: null })
    expect(running.getClientConfig()).toEqual({ endpoint: null, token: 'test-token' })
    const started = await running.start(32189)
    expect(running.status).toEqual({ enabled: true, port: 32189, endpoint: started.endpoint })
    await expect(request(32189, 'wrong')).resolves.toMatchObject({ status: 401 })
    await expect(request(32189, 'test-token', { headers: { Origin: 'https://example.com' } })).resolves.toMatchObject({ status: 403 })
    await expect(request(32189, 'test-token', { headers: { Host: 'example.com' } })).resolves.toMatchObject({ status: 403 })
    expect(started.endpoint).toBe('http://127.0.0.1:32189/mcp')
    await running.close()
    expect(running.status).toEqual({ enabled: false, port: null, endpoint: null })
  })

  it('completes initialize, tool discovery, tool call, and session deletion', async () => {
    const facade = {
      listSerialPorts: async () => [{ path: '/dev/tty.test', manufacturer: 'Test' }],
      listSessions: async () => [],
      readLogTail: async () => ({ sessionId: 's', lines: [], truncated: false })
    }
    const server = new McpHttpServer(facade, 'integration-token')
    await server.start(32190)
    const baseHeaders = { Accept: 'application/json, text/event-stream' }
    const initialized = await request(32190, 'integration-token', {
      method: 'POST',
      headers: baseHeaders,
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } }
      }
    })
    expect(initialized.status).toBe(200)
    const sessionId = initialized.headers['mcp-session-id']
    expect(typeof sessionId).toBe('string')

    const list = await request(32190, 'integration-token', {
      method: 'POST',
      headers: { ...baseHeaders, 'mcp-session-id': sessionId as string },
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }
    })
    expect(list.status).toBe(200)
    expect(list.body).toContain('serial_list_ports')

    const call = await request(32190, 'integration-token', {
      method: 'POST',
      headers: { ...baseHeaders, 'mcp-session-id': sessionId as string },
      body: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'serial_list_ports', arguments: {} } }
    })
    expect(call.status).toBe(200)
    expect(call.body).toContain('/dev/tty.test')

    const deleted = await request(32190, 'integration-token', {
      method: 'DELETE',
      headers: { ...baseHeaders, 'mcp-session-id': sessionId as string }
    })
    expect(deleted.status).toBe(200)
    await server.close()
  })
})
