export type McpPermission = 'read' | 'write' | 'destructive' | 'export'

export interface McpPermissionPolicy {
  read: boolean
  write: boolean
  destructive: boolean
  export: boolean
}

export const DEFAULT_MCP_PERMISSION_POLICY: McpPermissionPolicy = {
  read: true,
  write: false,
  destructive: false,
  export: false
}

export interface SerialPortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
  pnpId?: string
  locationId?: string
  friendlyName?: string
  vendorId?: string
  productId?: string
}

export interface SessionSummary {
  sessionId: string
  connectionType: string
  name?: string
  endpoint?: string
  owner: 'user' | 'ai'
  state: 'connecting' | 'connected' | 'closing' | 'closed'
}

export interface LogTailResult {
  sessionId: string
  lines: string[]
  truncated: boolean
  nextOffset?: number
}

export interface SessionReadResult {
  sessionId: string
  lines: string[]
  truncated: boolean
}

export interface LogSearchResult {
  sessionId: string
  query: string
  matches: Array<{ lineNumber: number; text: string }>
  truncated: boolean
}

export interface LogAnalyzeEvent {
  eventId: string
  level: 'info' | 'warning' | 'error'
  summary: string
  lineNumber: number
  text: string
}

export interface WriteLease {
  sessionId: string
  ownerId: string
  expiresAt: number
}

export interface DeviceTemplateCommand {
  id: string
  label: string
  text: string
  lineEnding?: 'none' | 'LF' | 'CR' | 'CRLF'
  risk: McpPermission
  wait?: { type: 'literal' | 'regex'; pattern: string; timeoutMs: number }
}

export interface DeviceTemplate {
  id: string
  version: number
  name: string
  description?: string
  connectionTypes: Array<'serial' | 'telnet' | 'ftp'>
  permissions: { defaultMode: 'read-only' | 'read-write'; allowWrite: boolean }
  commands: DeviceTemplateCommand[]
  logEvents: Array<{ id: string; level: 'info' | 'warning' | 'error'; pattern: string; summary: string }>
}

export interface McpFacade {
  listSerialPorts(): Promise<SerialPortInfo[]>
  listSessions(): Promise<SessionSummary[]>
  readLogTail(sessionId: string, options?: { maxBytes?: number; maxLines?: number }): Promise<LogTailResult>
  readSession?(sessionId: string, options?: { maxLines?: number }): Promise<SessionReadResult>
  searchLogs?(sessionId: string, query: string, options?: { maxBytes?: number; maxMatches?: number }): Promise<LogSearchResult>
  analyzeLog?(
    sessionId: string,
    templateId: string,
    options?: { maxBytes?: number }
  ): Promise<{ sessionId: string; templateId: string; events: LogAnalyzeEvent[]; truncated: boolean }>
  summarizeLog?(sessionId: string, options?: { maxBytes?: number }): Promise<unknown>
  findLogAnomalies?(sessionId: string, options?: { maxBytes?: number }): Promise<unknown>
  compareLogs?(leftSessionId: string, rightSessionId: string, options?: { maxBytes?: number }): Promise<unknown>
  listTemplates?(): Promise<Array<Pick<DeviceTemplate, 'id' | 'version' | 'name' | 'description'>>>
  getTemplate?(id: string): Promise<DeviceTemplate | undefined>
  sendSession?(sessionId: string, command: string): Promise<unknown>
  sendSessionAndWait?(
    sessionId: string,
    command: string,
    wait: { type: 'literal' | 'regex'; pattern: string; timeoutMs: number }
  ): Promise<unknown>
  runTemplateCommand?(sessionId: string, templateId: string, commandId: string, ownerId: string): Promise<unknown>
  startSessionPort?(port: string, baudRate?: number, ownerId?: string): Promise<unknown>
  startSavedSession?(connectionId: number, ownerId?: string): Promise<unknown>
  uploadSessionFile?(sessionId: string, localFilePath: string, remoteFileName: string, ownerId: string): Promise<unknown>
  stopSession?(sessionId: string): Promise<unknown>
  acquireWriteLease?(sessionId: string, ownerId: string, ttlMs?: number): Promise<WriteLease>
  releaseWriteLease?(sessionId: string, ownerId: string): Promise<void>
  assertWriteLease?(sessionId: string, ownerId: string): void
}
