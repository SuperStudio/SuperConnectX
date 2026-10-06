import type { McpPermission } from './McpTypes'

export interface McpTemplateCommand {
  id: string
  label: string
  text: string
  lineEnding?: 'none' | 'LF' | 'CR' | 'CRLF'
  risk: McpPermission
  wait?: { type: 'literal' | 'regex'; pattern: string; timeoutMs: number }
}

export interface McpDeviceTemplate {
  id: string
  version: number
  name: string
  description?: string
  connectionTypes: Array<'serial' | 'telnet' | 'ftp'>
  permissions: { defaultMode: 'read-only' | 'read-write'; allowWrite: boolean }
  commands: McpTemplateCommand[]
  logEvents: Array<{ id: string; level: 'info' | 'warning' | 'error'; pattern: string; summary: string }>
}
