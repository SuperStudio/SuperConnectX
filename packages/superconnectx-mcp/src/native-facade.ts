import { SerialPort } from 'serialport'
import type {
  DeviceTemplate,
  LogTailResult,
  McpFacade,
  SerialPortInfo,
  SessionSummary
} from './types.js'
import type { TemplateRegistry } from './templates.js'
import { WriteLeaseManager } from './leases.js'
import {
  analyzeLogLines,
  applyLineEnding,
  compareLogLines,
  findLogAnomalies,
  redactSensitiveText,
  searchLogLines,
  summarizeLogLines
} from './log-analysis.js'

type NativeSession = {
  port: SerialPort
  lines: string[]
  info: SessionSummary
}

const MAX_SESSION_LINES = 100_000

export class NativeMcpFacade implements McpFacade {
  private readonly sessions = new Map<string, NativeSession>()
  private readonly leases = new WriteLeaseManager()

  constructor(private readonly templates?: TemplateRegistry) {}

  async listTemplates() {
    return this.templates?.list() ?? []
  }

  async getTemplate(id: string) {
    return this.templates?.get(id)
  }

  async listSerialPorts(): Promise<SerialPortInfo[]> {
    return (await SerialPort.list()).map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer,
      serialNumber: port.serialNumber,
      pnpId: port.pnpId,
      locationId: port.locationId,
      vendorId: port.vendorId,
      productId: port.productId,
      friendlyName: (port as { friendlyName?: string }).friendlyName
    }))
  }

  async listSessions(): Promise<SessionSummary[]> {
    return [...this.sessions.values()].map(({ info }) => ({ ...info }))
  }

  async readSession(sessionId: string, options: { maxLines?: number } = {}) {
    const session = this.require(sessionId)
    const maxLines = Math.min(Math.max(options.maxLines ?? 500, 1), 10_000)
    const lines = session.lines.slice(-maxLines).map(redactSensitiveText)
    return {
      sessionId,
      lines,
      truncated: session.lines.length > maxLines
    }
  }

  async readLogTail(
    sessionId: string,
    options: { maxBytes?: number; maxLines?: number } = {}
  ): Promise<LogTailResult> {
    const data = await this.readSession(sessionId, { maxLines: options.maxLines })
    return { ...data, nextOffset: this.require(sessionId).lines.length }
  }

  async searchLogs(sessionId: string, query: string, options: { maxBytes?: number; maxMatches?: number } = {}) {
    const tail = await this.readLogTail(sessionId, { maxLines: 10_000 })
    return searchLogLines(sessionId, tail.lines, query, {
      truncated: tail.truncated,
      maxMatches: options.maxMatches
    })
  }

  async analyzeLog(sessionId: string, templateId: string, options: { maxBytes?: number } = {}) {
    const template = this.requireTemplate(templateId)
    const tail = await this.readLogTail(sessionId, { maxLines: 10_000 })
    return analyzeLogLines(sessionId, templateId, tail.lines, template, tail.truncated)
  }

  async summarizeLog(sessionId: string, options: { maxBytes?: number } = {}) {
    const tail = await this.readLogTail(sessionId, { maxLines: 10_000 })
    return summarizeLogLines(sessionId, tail.lines, tail.truncated)
  }

  async findLogAnomalies(sessionId: string, options: { maxBytes?: number } = {}) {
    const tail = await this.readLogTail(sessionId, { maxLines: 10_000 })
    return findLogAnomalies(sessionId, tail.lines, tail.truncated)
  }

  async compareLogs(leftSessionId: string, rightSessionId: string, options: { maxBytes?: number } = {}) {
    const [left, right] = await Promise.all([
      this.readLogTail(leftSessionId, { maxLines: 10_000 }),
      this.readLogTail(rightSessionId, { maxLines: 10_000 })
    ])
    return compareLogLines(leftSessionId, rightSessionId, left.lines, right.lines, left.truncated || right.truncated)
  }

  async startSessionPort(port: string, baudRate = 115200, ownerId = 'cli') {
    if ([...this.sessions.values()].some((session) => session.info.endpoint === port)) {
      throw new Error(`Session already exists for ${port}`)
    }
    const sessionId = `cli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const serial = new SerialPort({ path: port, baudRate, autoOpen: false })
    const info: SessionSummary = {
      sessionId,
      connectionType: 'serial',
      name: port,
      endpoint: port,
      owner: 'ai',
      state: 'connecting'
    }
    const session: NativeSession = { port: serial, lines: [], info }
    this.sessions.set(sessionId, session)
    serial.on('data', (chunk: Buffer) => {
      const parts = chunk.toString('utf8').split(/\r?\n/).filter((line) => line.length > 0)
      session.lines.push(...parts)
      if (session.lines.length > MAX_SESSION_LINES) {
        session.lines.splice(0, session.lines.length - MAX_SESSION_LINES)
      }
    })
    try {
      await new Promise<void>((resolve, reject) => {
        serial.open((error) => (error ? reject(error) : resolve()))
      })
    } catch (error) {
      this.sessions.delete(sessionId)
      throw error
    }
    info.state = 'connected'
    return { sessionId, ownerId, port }
  }

  async startSavedSession(): Promise<never> {
    throw new Error('Saved connections are only available in the SuperConnectX desktop MCP runtime')
  }

  async sendSession(sessionId: string, command: string) {
    const session = this.require(sessionId)
    await new Promise<void>((resolve, reject) => {
      session.port.write(command, (error) => (error ? reject(error) : resolve()))
    })
    return { success: true, sessionId }
  }

  async sendSessionAndWait(
    sessionId: string,
    command: string,
    wait: { type: 'literal' | 'regex'; pattern: string; timeoutMs: number }
  ) {
    const started = await this.sendSession(sessionId, command)
    if ((started as { success?: boolean })?.success === false) return started
    const deadline = Date.now() + Math.min(Math.max(wait.timeoutMs, 1), 120_000)
    let matcher: RegExp | null = null
    if (wait.type === 'regex') {
      try {
        matcher = new RegExp(wait.pattern)
      } catch {
        throw new Error(`Invalid wait regex: ${wait.pattern}`)
      }
    }
    while (Date.now() <= deadline) {
      const result = await this.readSession(sessionId, { maxLines: 500 })
      const index = result.lines.findIndex((line) => (matcher ? matcher.test(line) : line.includes(wait.pattern)))
      if (index >= 0) {
        return { success: true, response: result.lines.slice(index), matchedLine: result.lines[index] }
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return {
      success: false,
      timeout: true,
      response: (await this.readSession(sessionId, { maxLines: 500 })).lines
    }
  }

  async runTemplateCommand(sessionId: string, templateId: string, commandId: string, ownerId: string) {
    const template = this.requireTemplate(templateId)
    const command = template.commands.find((item) => item.id === commandId)
    if (!command) throw new Error(`Template command not found: ${templateId}/${commandId}`)
    this.leases.assertOwner(sessionId, ownerId)
    const text = applyLineEnding(command.text, command.lineEnding)
    if (command.wait) return this.sendSessionAndWait(sessionId, text, command.wait)
    return this.sendSession(sessionId, text)
  }

  async uploadSessionFile(): Promise<never> {
    throw new Error('FTP upload is not available in the standalone CLI runtime')
  }

  async stopSession(sessionId: string) {
    const session = this.require(sessionId)
    await new Promise<void>((resolve) => {
      if (!session.port.isOpen) {
        resolve()
        return
      }
      session.port.close(() => resolve())
    })
    session.info.state = 'closed'
    this.leases.clear(sessionId)
    this.sessions.delete(sessionId)
    return { success: true, sessionId }
  }

  async acquireWriteLease(sessionId: string, ownerId: string, ttlMs?: number) {
    this.require(sessionId)
    return this.leases.acquire(sessionId, ownerId, ttlMs)
  }

  async releaseWriteLease(sessionId: string, ownerId: string) {
    this.leases.release(sessionId, ownerId)
  }

  assertWriteLease(sessionId: string, ownerId: string) {
    this.leases.assertOwner(sessionId, ownerId)
  }

  private require(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    return session
  }

  private requireTemplate(templateId: string): DeviceTemplate {
    const template = this.templates?.get(templateId)
    if (!template) throw new Error(`Template not found: ${templateId}`)
    return template
  }
}
