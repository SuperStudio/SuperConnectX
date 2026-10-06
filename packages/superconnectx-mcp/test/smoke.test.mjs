import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createMcpServer,
  McpLoopbackServer,
  WriteLeaseManager,
  TemplateRegistry,
  searchLogLines,
  summarizeLogLines,
  MemoryAuditSink,
  mapErrorToMcp,
  mcpToolResult,
  buildAuditEvent,
  shouldAuditTool,
  summarizeCommand
} from '../dist/index.js'

test('exports server core and loopback transport with desktop-parity guards', async () => {
  const facade = {
    listSerialPorts: async () => [],
    listSessions: async () => [],
    readLogTail: async () => ({ sessionId: 'x', lines: [], truncated: false })
  }
  assert.ok(createMcpServer(facade))
  const server = new McpLoopbackServer(facade, 'test-token')
  assert.equal(server.status.enabled, false)
  const started = await server.start(32191)
  assert.equal(started.endpoint, 'http://127.0.0.1:32191/mcp')
  assert.equal(server.getClientConfig().token, 'test-token')
  assert.equal(server.status.enabled, true)
  assert.notEqual(server.rotateToken('rotated'), 'test-token')
  await server.close()
  assert.equal(server.status.enabled, false)
})

test('tool results include meta.requestId and source', () => {
  const payload = mcpToolResult({ ok: true, truncated: true }, { requestId: 'req-1' })
  const body = JSON.parse(payload.content[0].text)
  assert.deepEqual(body.data, { ok: true, truncated: true })
  assert.equal(body.meta.requestId, 'req-1')
  assert.equal(body.meta.truncated, true)
  assert.equal(body.meta.source, 'superconnectx')
})

test('write tools emit audit events with command summary only', async () => {
  assert.equal(shouldAuditTool('session_send'), true)
  assert.equal(shouldAuditTool('log_tail'), false)
  assert.equal(summarizeCommand('password=secret-value AT+OK'), 'password=[REDACTED] AT+OK')
  const event = buildAuditEvent({
    requestId: 'req-audit',
    tool: 'session_send',
    args: { sessionId: 's1', ownerId: 'ai-1', command: 'password=secret-value AT+OK' },
    result: 'ok'
  })
  assert.equal(event.summary, 'password=[REDACTED] AT+OK')
  assert.equal(event.sessionId, 's1')
  assert.equal(event.ownerId, 'ai-1')
  assert.equal(mapErrorToMcp(new Error('Write lease required: s1')).code, 'SESSION_WRITE_LOCKED')
  assert.equal(mapErrorToMcp(new Error('Cannot stop user-owned session: s1')).code, 'PERMISSION_DENIED')

  const audit = new MemoryAuditSink()
  audit.write(event)
  assert.equal(audit.events.length, 1)
  assert.ok(createMcpServer(
    {
      listSerialPorts: async () => [],
      listSessions: async () => [],
      readLogTail: async () => ({ sessionId: 's1', lines: [], truncated: false })
    },
    { read: true, write: true, destructive: false, export: false },
    { audit }
  ))
})

test('write lease manager enforces exclusive ownership', () => {
  const leases = new WriteLeaseManager()
  const lease = leases.acquire('s1', 'a', 10_000)
  assert.equal(lease.ownerId, 'a')
  assert.throws(() => leases.acquire('s1', 'b'), /another client/)
  leases.assertOwner('s1', 'a')
  leases.release('s1', 'a')
  assert.throws(() => leases.assertOwner('s1', 'a'), /required/)
})

test('template registry validates and skips invalid files', async () => {
  const registry = new TemplateRegistry()
  const template = {
    id: 'demo.device',
    version: 1,
    name: 'Demo',
    connectionTypes: ['serial'],
    permissions: { defaultMode: 'read-only', allowWrite: false },
    commands: [{ id: 'version', label: 'Version', text: 'version', risk: 'read' }],
    logEvents: [{ id: 'error', level: 'error', pattern: 'error', summary: 'error' }]
  }
  registry.register(template)
  assert.equal(registry.get('demo.device')?.name, 'Demo')
  registry.register({ commands: ['version', { command: 'status', expect: 'ok' }] }, 'short.device')
  assert.equal(registry.get('short.device')?.commands[1]?.wait?.pattern, 'ok')
  assert.throws(() => registry.register({ ...template, id: '../evil' }))
})

test('log helpers summarize and search evidence', () => {
  const lines = ['boot ok', 'token=secret-value', 'error timeout', 'done']
  const summary = summarizeLogLines('s1', lines)
  assert.equal(summary.counts.error, 1)
  const search = searchLogLines('s1', lines, 'timeout')
  assert.equal(search.matches.length, 1)
  assert.equal(search.matches[0].lineNumber, 3)
})
