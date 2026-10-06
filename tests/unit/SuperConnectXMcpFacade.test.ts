import { describe, expect, it, vi } from 'vitest'
import SuperConnectXMcpFacade from '../../apps/superconnectx/src/main/mcp/SuperConnectXMcpFacade'

vi.mock('../../apps/superconnectx/src/main/ipc/IpcSerialPort', () => ({
  default: { getInstance: () => ({ listSerialPorts: vi.fn(async () => [{ path: 'COM3' }]) }) }
}))

const stopMcpSession = vi.fn(async () => ({ success: true }))
const startMcpSerialSession = vi.fn(async () => ({ success: true, sessionId: 'mcp-new' }))

vi.mock('../../apps/superconnectx/src/main/ipc/IpcConnector', () => ({
  default: {
    getInstance: () => ({
      listMcpSessions: () => [
        { sessionId: 's1', connectionType: 'com', owner: 'user', state: 'connected', endpoint: 'COM3' },
        { sessionId: 'mcp-1', connectionType: 'com', owner: 'ai', state: 'connected', endpoint: 'COM4' }
      ],
      getMcpLogFilePath: vi.fn(async () => ({ success: false, message: 'missing' })),
      stopMcpSession,
      startMcpSerialSession
    })
  }
}))

describe('SuperConnectXMcpFacade', () => {
  it('reads current serial ports and sessions through existing host services', async () => {
    const facade = new SuperConnectXMcpFacade()
    await expect(facade.listSerialPorts()).resolves.toEqual([{ path: 'COM3' }])
    await expect(facade.listSessions()).resolves.toEqual([
      { sessionId: 's1', connectionType: 'com', owner: 'user', state: 'connected', endpoint: 'COM3' },
      { sessionId: 'mcp-1', connectionType: 'com', owner: 'ai', state: 'connected', endpoint: 'COM4' }
    ])
  })

  it('returns a bounded missing-log error', async () => {
    const facade = new SuperConnectXMcpFacade()
    await expect(facade.readLogTail('missing')).rejects.toThrow('missing')
  })

  it('blocks stopping user-owned sessions and reopening busy ports', async () => {
    const facade = new SuperConnectXMcpFacade()
    await expect(facade.stopSession('s1')).rejects.toThrow('user-owned')
    expect(stopMcpSession).not.toHaveBeenCalled()
    await expect(facade.startSessionPort('COM3')).rejects.toThrow('already in use')
    expect(startMcpSerialSession).not.toHaveBeenCalled()
    await expect(facade.stopSession('mcp-1')).resolves.toEqual({ success: true })
    expect(stopMcpSession).toHaveBeenCalledWith('mcp-1')
  })
})
