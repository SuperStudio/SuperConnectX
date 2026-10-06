import fs from 'fs/promises'
import path from 'path'
import IpcConnector from '../ipc/IpcConnector'
import IpcSerialPort from '../ipc/IpcSerialPort'
import type { McpFacade, LogTailResult, SerialPortInfo, SessionSummary } from '../../shared/mcp/McpTypes'
import type { McpTemplateRegistry } from './McpTemplateRegistry'
import McpWriteLeaseManager from './McpWriteLeaseManager'
import {
  analyzeLogLines,
  applyLineEnding,
  compareLogLines,
  findLogAnomalies,
  redactSensitiveText,
  searchLogLines,
  summarizeLogLines
} from '@superconnectx/mcp/log-analysis'
import type { DeviceTemplate } from '@superconnectx/mcp/types'

const DEFAULT_MAX_BYTES = 64 * 1024
const DEFAULT_MAX_LINES = 500

export default class SuperConnectXMcpFacade implements McpFacade {
  private readonly leases = new McpWriteLeaseManager()
  constructor(private readonly templates?: McpTemplateRegistry) {}

  async listSerialPorts(): Promise<SerialPortInfo[]> {
    return (await IpcSerialPort.getInstance().listSerialPorts(false)) as SerialPortInfo[]
  }

  async listSessions(): Promise<SessionSummary[]> {
    return IpcConnector.getInstance().listMcpSessions()
  }

  async readSession(sessionId: string, options: { maxLines?: number } = {}) {
    return IpcConnector.getInstance().readMcpSession(sessionId, options.maxLines)
  }

  async readLogTail(
    sessionId: string,
    options: { maxBytes?: number; maxLines?: number } = {}
  ): Promise<LogTailResult> {
    const maxBytes = Math.min(Math.max(options.maxBytes ?? DEFAULT_MAX_BYTES, 1), 1024 * 1024)
    const maxLines = Math.min(Math.max(options.maxLines ?? DEFAULT_MAX_LINES, 1), 10_000)
    const pathResult = await IpcConnector.getInstance().getMcpLogFilePath(sessionId)
    if (!pathResult.success || !pathResult.filePath) {
      throw new Error(pathResult.message || 'Log file not found')
    }

    const filePath = path.resolve(pathResult.filePath)
    const stat = await fs.stat(filePath)
    const start = Math.max(0, stat.size - maxBytes)
    const handle = await fs.open(filePath, 'r')
    try {
      const buffer = Buffer.alloc(stat.size - start)
      await handle.read(buffer, 0, buffer.length, start)
      const text = buffer.toString('utf8')
      const lines = text.split(/\r?\n/).filter((line) => line.length > 0)
      const limitedLines = lines.slice(-maxLines).map(redactSensitiveText)
      return {
        sessionId,
        lines: limitedLines,
        truncated: start > 0 || limitedLines.length < lines.length,
        nextOffset: stat.size
      }
    } finally {
      await handle.close()
    }
  }

  async searchLogs(sessionId: string, query: string, options: { maxBytes?: number; maxMatches?: number } = {}) {
    const tail = await this.readLogTail(sessionId, {
      maxBytes: options.maxBytes ?? 1024 * 1024,
      maxLines: 10_000
    })
    return searchLogLines(sessionId, tail.lines, query, {
      truncated: tail.truncated,
      maxMatches: options.maxMatches
    })
  }

  async analyzeLog(sessionId: string, templateId: string, options: { maxBytes?: number } = {}) {
    const template = this.templates?.get(templateId) as DeviceTemplate | undefined
    if (!template) throw new Error(`Template not found: ${templateId}`)
    const tail = await this.readLogTail(sessionId, {
      maxBytes: options.maxBytes ?? 1024 * 1024,
      maxLines: 10_000
    })
    return analyzeLogLines(sessionId, templateId, tail.lines, template, tail.truncated)
  }

  async summarizeLog(sessionId: string, options: { maxBytes?: number } = {}) {
    const tail = await this.readLogTail(sessionId, {
      maxBytes: options.maxBytes ?? 1024 * 1024,
      maxLines: 10_000
    })
    return summarizeLogLines(sessionId, tail.lines, tail.truncated)
  }

  async findLogAnomalies(sessionId: string, options: { maxBytes?: number } = {}) {
    const tail = await this.readLogTail(sessionId, {
      maxBytes: options.maxBytes ?? 1024 * 1024,
      maxLines: 10_000
    })
    return findLogAnomalies(sessionId, tail.lines, tail.truncated)
  }

  async compareLogs(leftSessionId: string, rightSessionId: string, options: { maxBytes?: number } = {}) {
    const [left, right] = await Promise.all([
      this.readLogTail(leftSessionId, { maxBytes: options.maxBytes ?? 512 * 1024, maxLines: 10_000 }),
      this.readLogTail(rightSessionId, { maxBytes: options.maxBytes ?? 512 * 1024, maxLines: 10_000 })
    ])
    return compareLogLines(
      leftSessionId,
      rightSessionId,
      left.lines,
      right.lines,
      left.truncated || right.truncated
    )
  }

  async listTemplates() {
    return this.templates?.list() ?? []
  }

  async getTemplate(id: string) {
    return this.templates?.get(id)
  }

  async sendSession(sessionId: string, command: string) {
    return IpcConnector.getInstance().sendMcpSession(sessionId, command)
  }

  async sendSessionAndWait(
    sessionId: string,
    command: string,
    wait: { type: 'literal' | 'regex'; pattern: string; timeoutMs: number }
  ) {
    const started = await this.sendSession(sessionId, command)
    if ((started as { success?: boolean })?.success === false) return started
    const deadline = Date.now() + Math.min(Math.max(wait.timeoutMs, 1), 120_000)
    const matcher = wait.type === 'regex' ? new RegExp(wait.pattern) : null
    while (Date.now() <= deadline) {
      const result = await this.readSession(sessionId, { maxLines: 500 })
      const index = result.lines.findIndex((line) =>
        matcher ? matcher.test(line) : line.includes(wait.pattern)
      )
      if (index >= 0) return { success: true, response: result.lines.slice(index), matchedLine: result.lines[index] }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return {
      success: false,
      timeout: true,
      response: (await this.readSession(sessionId, { maxLines: 500 })).lines
    }
  }

  async runTemplateCommand(sessionId: string, templateId: string, commandId: string, ownerId: string) {
    const template = this.templates?.get(templateId)
    const command = template?.commands.find((item) => item.id === commandId)
    if (!command) throw new Error(`Template command not found: ${templateId}/${commandId}`)
    this.leases.assertOwner(sessionId, ownerId)
    const text = applyLineEnding(command.text, command.lineEnding)
    if (command.wait) return this.sendSessionAndWait(sessionId, text, command.wait)
    return this.sendSession(sessionId, text)
  }

  async stopSession(sessionId: string) {
    const session = (await this.listSessions()).find((item) => item.sessionId === sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    if (session.owner === 'user') {
      throw new Error(`Cannot stop user-owned session: ${sessionId}`)
    }
    return IpcConnector.getInstance().stopMcpSession(sessionId)
  }

  async startSessionPort(port: string, baudRate?: number, ownerId?: string) {
    const existing = (await this.listSessions()).find(
      (session) => session.endpoint === port && session.state !== 'closed'
    )
    if (existing) {
      throw new Error(`Port already in use by session ${existing.sessionId} (owner=${existing.owner})`)
    }
    return IpcConnector.getInstance().startMcpSerialSession(port, baudRate, ownerId)
  }

  async startSavedSession(connectionId: number, ownerId?: string) {
    return IpcConnector.getInstance().startMcpSavedSession(connectionId, ownerId)
  }

  async uploadSessionFile(sessionId: string, localFilePath: string, remoteFileName: string, ownerId: string) {
    this.leases.assertOwner(sessionId, ownerId)
    return IpcConnector.getInstance().uploadMcpSessionFile(sessionId, localFilePath, remoteFileName)
  }

  async acquireWriteLease(sessionId: string, ownerId: string, ttlMs?: number) {
    if (!(await this.listSessions()).some((session) => session.sessionId === sessionId)) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    return this.leases.acquire(sessionId, ownerId, ttlMs)
  }

  async releaseWriteLease(sessionId: string, ownerId: string) {
    this.leases.release(sessionId, ownerId)
  }

  assertWriteLease(sessionId: string, ownerId: string) {
    this.leases.assertOwner(sessionId, ownerId)
  }
}
