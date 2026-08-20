import net from 'net'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfigDomainAdapter, ConfigServiceError } from '../../src/main/services/ConfigService'
import ConfigService from '../../src/main/services/ConfigService'
import ConnectionService, { ConnectionBackend } from '../../src/main/services/ConnectionService'
import { InstanceInfo } from '../../src/main/extensions/ai-control-bridge/types/AiBridgeTypes'
import RuntimeEventHub from '../../src/main/services/RuntimeEventHub'
import AiBridgeServer from '../../src/main/extensions/ai-control-bridge/transport/AiBridgeServer'
import AiBridgePolicy from '../../src/main/extensions/ai-control-bridge/services/AiBridgePolicy'
import AiBridgeLogReader from '../../src/main/extensions/ai-control-bridge/services/AiBridgeLogReader'
import { getAiBridgeCapabilityState } from '../../src/shared/extensions/ai-control-bridge/AiBridgeCapabilities'
import type { AiBridgeClientStatus } from '../../src/shared/extensions/ai-control-bridge/AiBridgeEvents'

interface TestClient {
  socket: net.Socket
  request: (method: string, params?: Record<string, unknown>) => Promise<TestResponse>
  notifications: TestNotification[]
}

interface TestResponse {
  id?: number | string | null
  result: {
    authenticated: boolean
    registered: boolean
    clientName: string
    clients: AiBridgeClientStatus
    sessions: unknown[]
    attached: boolean
    mode: string
    subscriptionId: string
    success: boolean
    snapshot: { revision: number; value: Record<string, unknown> }
    events: TestRuntimeEvent[]
    value: Record<string, unknown>
    detached: boolean
  }
  error: {
    code: number
    message: string
    data: { code: string; details: { currentRevision: number } }
  }
}

interface TestRuntimeEvent {
  eventType: string
  source: string
  sessionId?: string
  payload: {
    method?: string
    action?: string
    status?: string
    details?: Record<string, unknown>
  }
}

interface TestNotification {
  method: string
  params: {
    subscriptionId: string
    event: TestRuntimeEvent
  }
}

function createConfigService(events: RuntimeEventHub): ConfigService {
  let value: Record<string, unknown> = {
    aiBridgeEnabled: true,
    aiBridgePermission: 'full-control',
    autoScroll: true,
    label: 'initial'
  }
  const adapter: ConfigDomainAdapter = {
    domain: 'settings',
    schema: {
      domain: 'settings',
      targetRequired: false,
      fields: [
        {
          path: 'autoScroll',
          type: 'boolean',
          readable: true,
          writable: true,
          secret: false,
          applyMode: 'immediate'
        },
        {
          path: 'aiBridgeEnabled',
          type: 'boolean',
          readable: true,
          writable: true,
          secret: false,
          applyMode: 'immediate'
        },
        {
          path: 'aiBridgePermission',
          type: 'enum',
          enum: ['read-only', 'full-control'],
          readable: true,
          writable: true,
          secret: false,
          applyMode: 'immediate'
        },
        {
          path: 'label',
          type: 'string',
          readable: true,
          writable: true,
          secret: false,
          applyMode: 'immediate'
        }
      ]
    },
    get: () => ({ ...value }),
    patch: (_targetId, patch) => {
      value = { ...value, ...patch }
      return { ...value }
    }
  }
  const service = new ConfigService(events)
  service.register(adapter)
  service.register({
    domain: 'com-settings',
    schema: {
      domain: 'com-settings',
      targetRequired: true,
      fields: [
        {
          path: 'autoNewline',
          type: 'boolean',
          readable: true,
          writable: true,
          secret: false,
          applyMode: 'immediate'
        },
        {
          path: 'hexMode',
          type: 'boolean',
          readable: true,
          writable: true,
          secret: false,
          applyMode: 'immediate'
        },
        {
          path: 'crcEnabled',
          type: 'boolean',
          readable: true,
          writable: true,
          secret: false,
          applyMode: 'immediate'
        },
        {
          path: 'crcMethod',
          type: 'string',
          readable: true,
          writable: true,
          secret: false,
          applyMode: 'immediate'
        }
      ]
    },
    get: () => ({
      autoNewline: true,
      hexMode: false,
      crcEnabled: false,
      crcMethod: 'CRC-16/MODBUS'
    }),
    patch: () => ({
      autoNewline: true,
      hexMode: false,
      crcEnabled: false,
      crcMethod: 'CRC-16/MODBUS'
    })
  })
  return service
}

function createUnavailableLogReader(): AiBridgeLogReader {
  return new AiBridgeLogReader({
    getLogFilePath: vi.fn(async () => ({ success: false, message: 'Log unavailable in test' }))
  })
}

function createConnectionService(events: RuntimeEventHub): {
  service: ConnectionService
  backend: ConnectionBackend
} {
  const backend: ConnectionBackend = {
    start: vi.fn(async () => ({ success: true })),
    send: vi.fn(async () => ({ success: true })),
    stop: vi.fn(async () => ({ success: true })),
    update: vi.fn(async () => ({ success: true }))
  }
  const service = new ConnectionService(backend, events)
  return { service, backend }
}

function createInstance(endpoint: string): InstanceInfo {
  return {
    instanceId: 'instance-test',
    pid: process.pid,
    instanceIndex: 0,
    appVersion: 'test',
    endpoint
  }
}

async function createClient(pipeName: string): Promise<TestClient> {
  const socket = net.createConnection(pipeName)
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('error', reject)
  })

  let buffer = ''
  let requestId = 0
  const pending = new Map<number, (value: TestResponse) => void>()
  const notifications: TestNotification[] = []
  socket.setEncoding('utf8')
  socket.on('data', (chunk: string) => {
    buffer += chunk
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      if (line.trim()) {
        const message = JSON.parse(line) as TestResponse & TestNotification
        if (typeof message.id === 'number') pending.get(message.id)?.(message)
        else notifications.push(message)
      }
      index = buffer.indexOf('\n')
    }
  })

  const request = (method: string, params: Record<string, unknown> = {}): Promise<TestResponse> => {
    const id = ++requestId
    return new Promise((resolve, reject) => {
      pending.set(id, resolve)
      socket.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
      setTimeout(() => {
        if (!pending.has(id)) return
        pending.delete(id)
        reject(new Error(`Timed out waiting for ${method}`))
      }, 3000)
    })
  }

  return { socket, request, notifications }
}

async function waitForNotification(
  client: TestClient,
  predicate: (message: TestNotification) => boolean
): Promise<TestNotification> {
  for (let i = 0; i < 100; i++) {
    const found = client.notifications.find(predicate)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for bridge notification')
}

async function waitForClientStatus(
  server: AiBridgeServer,
  predicate: (status: AiBridgeClientStatus) => boolean
): Promise<AiBridgeClientStatus> {
  for (let i = 0; i < 30; i++) {
    const status = server.getClientStatus()
    if (predicate(status)) return status
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for AI client status')
}

describe('AI control bridge and shared runtime services', () => {
  it('reports read-only access for mixed capabilities without exposing write-only actions', () => {
    const states = getAiBridgeCapabilityState(true, 'read-only')
    const state = (id: string): (typeof states)[number] | undefined =>
      states.find((item) => item.id === id)

    expect(state('sessions.attach')).toMatchObject({
      available: true,
      readAvailable: true,
      writeAvailable: false
    })
    expect(state('commands.manage')).toMatchObject({
      available: true,
      readAvailable: true,
      writeAvailable: false
    })
    expect(state('sessions.lifecycle')).toMatchObject({
      available: false,
      readAvailable: false,
      writeAvailable: false
    })
    expect(state('serial.command')).toMatchObject({
      available: false,
      readAvailable: false,
      writeAvailable: false
    })
    expect(state('config.write')).toMatchObject({
      available: false,
      readAvailable: false,
      writeAvailable: false
    })
  })

  it('shares session state, sends through the injected backend, and removes on detach', async () => {
    const events = new RuntimeEventHub()
    const { service, backend } = createConnectionService(events)
    const conn = {
      sessionId: 'session-1',
      connectionType: 'com',
      comName: 'COM55',
      password: 'secret',
      baudRate: 115200
    }

    await service.start(conn)
    expect(service.getSession('session-1')).toMatchObject({ state: 'connected', comName: 'COM55' })
    expect(service.getSession('session-1')?.desiredConfig).not.toHaveProperty('password')
    expect(
      events
        .readSince(0)
        .events.find(
          (event) => event.eventType === 'session.state' && event.payload.state === 'connected'
        )
    ).toMatchObject({
      payload: { session: { sessionId: 'session-1', state: 'connected', comName: 'COM55' } }
    })

    await service.send('session-1', 'ls', 'ai')
    expect(backend.send).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1' }),
      'ls'
    )
    expect(events.readSince(0).events.some((event) => event.eventType === 'tx.accepted')).toBe(true)

    await service.update('session-1', { baudRate: 230400 }, 'ai')
    expect(service.getSession('session-1')?.desiredConfig.baudRate).toBe(230400)

    await service.stop('session-1', 'ai')
    expect(service.listSessions()).toHaveLength(0)
    expect(
      events.readSince(0).events.find((event) => event.eventType === 'session.closed')
    ).toMatchObject({
      payload: { session: { sessionId: 'session-1', state: 'closed', comName: 'COM55' } }
    })
  })

  it('uses optimistic revision checks for state patches', async () => {
    const events = new RuntimeEventHub()
    const service = createConfigService(events)

    expect(service.get('settings').revision).toBe(0)
    const result = await service.patch({
      domain: 'settings',
      patch: { autoScroll: false },
      expectedRevision: 0,
      source: 'ai'
    })
    expect(result.snapshot).toMatchObject({ revision: 1, value: { autoScroll: false } })
    expect(events.readSince(0).events.at(-1)?.eventType).toBe('config.changed')

    await expect(
      service.patch({
        domain: 'settings',
        patch: { autoScroll: true },
        expectedRevision: 0,
        source: 'ai'
      })
    ).rejects.toMatchObject<ConfigServiceError>({ code: 'CONFIG_REVISION_CONFLICT' })
  })

  it('captures RX only on demand and enforces byte-bounded batches', () => {
    const events = new RuntimeEventHub(64, 64 * 1024, 16 * 1024)
    events.publish({
      eventType: 'rx.display',
      sessionId: 'session-rx',
      source: 'system',
      payload: { data: 'ignored' }
    })
    expect(events.readSince(0, 100, { eventTypes: ['rx.display'] }).events).toHaveLength(0)

    const release = events.acquireRxCapture(['session-rx'])
    for (let index = 0; index < 8; index++) {
      events.publish({
        eventType: 'rx.display',
        sessionId: 'session-rx',
        source: 'system',
        payload: { data: `${index}:${'x'.repeat(4096)}` }
      })
    }
    const batch = events.readSince(0, 100, { eventTypes: ['rx.display'] }, 2048)
    expect(batch.returnedBytes).toBeLessThanOrEqual(2048)
    expect(batch.truncated).toBe(true)
    expect(batch.events[0]?.payload.dataTruncated).toBe(true)
    expect(batch.droppedBytes).toBeGreaterThan(0)
    expect(batch.nextCursor).toBeGreaterThan(0)

    release()
    expect(events.readSince(0, 100, { eventTypes: ['rx.display'] }).events).toHaveLength(0)
    const previousSequence = events.getLatestSequence()
    events.publish({
      eventType: 'rx.display',
      sessionId: 'session-rx',
      source: 'system',
      payload: { data: 'not retained after release' }
    })
    expect(
      events.readSince(previousSequence, 100, { eventTypes: ['rx.display'] }).events
    ).toHaveLength(0)
  })

  it('reads and searches connection logs within explicit limits', async () => {
    const filePath = path.join(os.tmpdir(), `scx-ai-log-${process.pid}-${Date.now()}.log`)
    fs.writeFileSync(
      filePath,
      Array.from({ length: 300 }, (_, index) =>
        index === 287 ? `${index} ERROR target failure` : `${index} DEBUG heartbeat`
      ).join('\n'),
      'utf8'
    )
    const reader = new AiBridgeLogReader({
      getLogFilePath: vi.fn(async () => ({ success: true, filePath }))
    })
    try {
      const tail = await reader.readTail('session-log', { maxBytes: 2048, maxLines: 20 })
      expect(tail.lineCount).toBeLessThanOrEqual(20)
      expect(tail.returnedBytes).toBeLessThanOrEqual(2048)

      const search = await reader.search('session-log', 'ERROR', {
        maxScanBytes: 64 * 1024,
        maxMatches: 5,
        contextLines: 1
      })
      expect(search.matchCount).toBe(1)
      expect(search.returnedBytes).toBeLessThanOrEqual(64 * 1024)
    } finally {
      fs.rmSync(filePath, { force: true })
    }
  })
})

describe('Named Pipe bridge pilot protocol', () => {
  let server: AiBridgeServer | null = null
  let client: TestClient | null = null

  afterEach(async () => {
    client?.socket.destroy()
    client = null
    await server?.stop()
    server = null
  })

  it('authenticates, attaches an existing session, reads and patches state, then detaches', async () => {
    const events = new RuntimeEventHub()
    const { service, backend } = createConnectionService(events)
    await service.start({
      sessionId: 'session-bridge',
      connectionType: 'com',
      comName: 'COM56',
      baudRate: 9600
    })
    const config = createConfigService(events)
    const pipeName = `\\\\.\\pipe\\superconnectx-test-${process.pid}-${Date.now()}`
    const savedConnections = [
      { id: 80, name: 'legacy COM80', connectionType: 'com', comName: 'COM80' }
    ]
    server = new AiBridgeServer(
      {
        instance: createInstance(pipeName),
        connections: service,
        config,
        events,
        access: new AiBridgePolicy(config),
        lifecycle: {
          startByConnectionId: vi.fn(async () => ({ success: true })),
          startByPort: vi.fn(async (portPath, sessionId, extraFields) => ({
            success: true,
            portPath,
            sessionId,
            extraFields
          })),
          stop: vi.fn(async () => ({ success: true }))
        },
        catalog: {
          listConnections: () => savedConnections,
          createConnection: vi.fn(() => ({})),
          updateConnection: vi.fn(() => ({})),
          deleteConnection: vi.fn(() => []),
          listCommandGroups: () => [],
          createCommandGroup: vi.fn(() => ({})),
          updateCommandGroup: vi.fn(() => ({})),
          deleteCommandGroup: vi.fn(() => []),
          listPresetCommands: () => [],
          createPresetCommand: vi.fn(() => ({})),
          updatePresetCommand: vi.fn(() => ({})),
          deletePresetCommand: vi.fn(() => [])
        },
        serialPorts: { list: vi.fn(async () => [{ path: 'COM90' }]) },
        logs: createUnavailableLogReader()
      },
      {
        pipeName,
        token: 'bridge-test-token',
        endpointFile: path.join(os.tmpdir(), `superconnectx-bridge-${process.pid}.json`)
      }
    )
    await server.start()
    client = await createClient(pipeName)

    const auth = await client.request('auth', { token: 'bridge-test-token' })
    expect(auth.result.authenticated).toBe(true)
    const hello = await client.request('client_hello', { clientName: 'Vitest AI' })
    expect(hello.result).toMatchObject({
      registered: true,
      clientName: 'Vitest AI',
      clients: { connected: true, clientCount: 1, clientNames: ['Vitest AI'] }
    })
    expect(server.getClientStatus()).toEqual({
      connected: true,
      clientCount: 1,
      clientNames: ['Vitest AI']
    })
    expect(
      events.readSince(0).events.some((event) => event.eventType === 'ai.client.changed')
    ).toBe(true)
    expect((await client.request('list_sessions')).result.sessions).toHaveLength(1)

    const startedPort = await client.request('start_port_session', {
      portPath: process.platform === 'win32' ? 90 : 'COM90',
      baudRate: 115200
    })
    expect(startedPort.result).toMatchObject({
      success: true,
      portPath: 'COM90',
      sessionId: expect.stringMatching(/^ai-port-COM90-/),
      extraFields: { baudRate: 115200 }
    })

    const missingPort = await client.request('start_port_session', { portPath: 'COM91' })
    expect(missingPort.error.data.code).toBe('PORT_NOT_FOUND')

    const createComProfile = await client.request('create_connection', {
      connection: { name: 'AI-TEST-COM80', connectionType: 'com', comName: 'COM80' }
    })
    expect(createComProfile.error).toMatchObject({
      code: -32014,
      data: { code: 'CONNECTION_TYPE_NOT_EXPOSED' }
    })

    const updateComProfile = await client.request('update_connection', {
      connection: { id: 80, name: 'legacy COM80', connectionType: 'com', comName: 'COM80' }
    })
    expect(updateComProfile.error).toMatchObject({
      code: -32014,
      data: { code: 'CONNECTION_TYPE_NOT_EXPOSED' }
    })

    const invalidGroup = await client.request('create_command_group', {
      group: { name: '   ', connectionType: 'com' }
    })
    expect(invalidGroup.error).toMatchObject({
      code: -32602,
      data: { code: 'INVALID_PARAMS' }
    })

    const attached = await client.request('attach_session', {
      sessionId: 'session-bridge',
      mode: 'write'
    })
    expect(attached.result.attached).toBe(true)
    const subscription = await client.request('subscribe', {
      eventTypes: ['config.changed', 'ai.activity']
    })
    expect(subscription.result.subscriptionId).toMatch(/^sub-/)

    const sent = await client.request('send', { sessionId: 'session-bridge', text: 'echo TEST' })
    expect(sent.result.success).toBe(true)
    const activity = await waitForNotification(
      client,
      (message) =>
        message.method === 'event' &&
        message.params.event.eventType === 'ai.activity' &&
        message.params.event.payload.method === 'send'
    )
    expect(activity.params.event).toMatchObject({
      source: 'ai',
      payload: {
        method: 'send',
        action: 'control',
        status: 'success',
        details: { command: 'echo TEST', sessionId: 'session-bridge' }
      }
    })
    expect(backend.send).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-bridge' }),
      'echo TEST\r\n'
    )
    const txEvents = (await client.request('read_events', { eventTypes: ['tx.accepted'] })).result
      .events
    expect(txEvents.at(-1)).toMatchObject({
      eventType: 'tx.accepted',
      sessionId: 'session-bridge',
      source: 'ai',
      payload: { input: 'echo TEST', displayCommand: 'echo TEST', preparedBySoftware: true }
    })

    const raw = await client.request('send', { sessionId: 'session-bridge', bytesBase64: 'AQI=' })
    expect(raw.error.data.code).toBe('SOFTWARE_SEND_TEXT_REQUIRED')

    const patched = await client.request('patch_config', {
      domain: 'settings',
      patch: { autoScroll: false },
      expectedRevision: 0
    })
    expect(patched.result.snapshot.revision).toBe(1)
    await waitForNotification(
      client,
      (message) => message.method === 'event' && message.params.event.eventType === 'config.changed'
    )
    expect(
      (await client.request('get_config', { domain: 'settings' })).result.value.autoScroll
    ).toBe(false)

    const connectionConfigPatch = await client.request('patch_config', {
      domain: 'connections',
      patch: { connectionType: 'com' }
    })
    expect(connectionConfigPatch.error.data.code).toBe('CONFIG_SCOPE_DENIED')
    expect(
      (await client.request('get_config', { domain: 'connections' })).error.data.code
    ).toBe('CONFIG_SCOPE_DENIED')
    expect(
      (await client.request('describe_config')).result.domains.map(
        (domain: { domain: string }) => domain.domain
      )
    ).toEqual(['settings', 'com-settings'])

    const conflict = await client.request('patch_config', {
      domain: 'settings',
      patch: { autoScroll: true },
      expectedRevision: 0
    })
    expect(conflict.error).toMatchObject({
      code: -32009,
      data: { code: 'CONFIG_REVISION_CONFLICT' }
    })
    expect(conflict.error.data.details.currentRevision).toBe(1)

    const invalidRxSubscription = await client.request('subscribe', {
      eventTypes: ['rx.display']
    })
    expect(invalidRxSubscription.error.data.code).toBe('INVALID_PARAMS')
    const rxSubscription = await client.request('subscribe', {
      eventTypes: ['rx.display'],
      sessionIds: ['session-bridge']
    })
    expect(rxSubscription.result.subscriptionId).toMatch(/^sub-/)

    client.socket.pause()
    for (let index = 0; index < 128; index++) {
      events.publish({
        eventType: 'rx.display',
        sessionId: 'session-bridge',
        source: 'system',
        payload: { data: `${index}:${'x'.repeat(32 * 1024)}` }
      })
    }
    client.socket.resume()
    const gap = await waitForNotification(client, (message) => message.method === 'stream.gap')
    expect((gap.params as unknown as { droppedEvents: number }).droppedEvents).toBeGreaterThan(0)

    const detached = await client.request('detach_session', { sessionId: 'session-bridge' })
    expect(detached.result.detached).toBe(true)
    const denied = await client.request('send', { sessionId: 'session-bridge', text: 'ls' })
    expect(denied.error.data.code).toBe('WRITE_ATTACH_REQUIRED')

    client.socket.destroy()
    client = null
    await expect(
      waitForClientStatus(server, (status) => status.connected === false)
    ).resolves.toEqual({ connected: false, clientCount: 0, clientNames: [] })
  })

  it('enforces the GUI-controlled master switch and read-only permission', async () => {
    const events = new RuntimeEventHub()
    const { service } = createConnectionService(events)
    await service.start({
      sessionId: 'session-gate',
      connectionType: 'com',
      comName: 'COM57',
      baudRate: 9600
    })
    const config = createConfigService(events)
    await config.patch({ domain: 'settings', patch: { aiBridgeEnabled: false }, source: 'gui' })
    const pipeName = `\\\\.\\pipe\\superconnectx-gate-${process.pid}-${Date.now()}`
    server = new AiBridgeServer(
      {
        instance: createInstance(pipeName),
        connections: service,
        config,
        events,
        access: new AiBridgePolicy(config),
        lifecycle: {
          startByConnectionId: vi.fn(async () => ({ success: true })),
          startByPort: vi.fn(async () => ({ success: true })),
          stop: vi.fn(async () => ({ success: true }))
        },
        catalog: {
          listConnections: () => [],
          createConnection: vi.fn(() => ({})),
          updateConnection: vi.fn(() => ({})),
          deleteConnection: vi.fn(() => []),
          listCommandGroups: () => [],
          createCommandGroup: vi.fn(() => ({})),
          updateCommandGroup: vi.fn(() => ({})),
          deleteCommandGroup: vi.fn(() => []),
          listPresetCommands: () => [],
          createPresetCommand: vi.fn(() => ({})),
          updatePresetCommand: vi.fn(() => ({})),
          deletePresetCommand: vi.fn(() => [])
        },
        serialPorts: { list: vi.fn(async () => []) },
        logs: createUnavailableLogReader()
      },
      {
        pipeName,
        token: 'gate-token'
      }
    )
    await server.start()
    client = await createClient(pipeName)

    await expect(client.request('auth', { token: 'gate-token' })).resolves.toMatchObject({
      result: { authenticated: true }
    })
    expect((await client.request('list_sessions')).error.data.code).toBe('BRIDGE_DISABLED')
    expect(
      (await client.request('client_hello', { clientName: 'Read-only AI' })).error.data.code
    ).toBe('BRIDGE_DISABLED')

    await config.patch({
      domain: 'settings',
      patch: { aiBridgeEnabled: true, aiBridgePermission: 'read-only' },
      source: 'gui'
    })
    expect((await client.request('list_sessions')).result.sessions).toHaveLength(1)
    expect(
      (await client.request('client_hello', { clientName: 'Read-only AI' })).result.registered
    ).toBe(true)
    expect(server.getClientStatus()).toMatchObject({ connected: true, clientCount: 1 })
    expect(
      (await client.request('client_hello', { clientName: ' '.repeat(81) })).error.data.code
    ).toBe('INVALID_PARAMS')
    expect(
      (await client.request('client_hello', { clientName: 'A'.repeat(81) })).error.data.code
    ).toBe('INVALID_PARAMS')
    expect(
      (await client.request('attach_session', { sessionId: 'session-gate', mode: 'read' })).result
        .attached
    ).toBe(true)
    expect(
      (await client.request('attach_session', { sessionId: 'session-gate', mode: 'write' })).error
        .data.code
    ).toBe('AI_READ_ONLY')
    expect(
      (await client.request('send', { sessionId: 'session-gate', text: 'echo DENIED' })).error.data
        .code
    ).toBe('AI_READ_ONLY')
    expect(
      (await client.request('patch_config', { domain: 'settings', patch: { autoScroll: false } }))
        .error.data.code
    ).toBe('AI_READ_ONLY')
  })
})
