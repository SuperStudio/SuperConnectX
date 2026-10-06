import type { McpPermissionPolicy } from '../../shared/mcp/McpTypes'
import type { McpFacade } from '@superx/mcp/types'
import { startMcpStdio } from '@superx/mcp/transports'

export async function startMcpStdioServer(
  facade: McpFacade,
  policy?: McpPermissionPolicy
): Promise<() => Promise<void>> {
  return startMcpStdio(facade, policy)
}
