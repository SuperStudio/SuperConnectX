import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

import { useTerminalToolbarActions } from '@/renderer/src/features/terminal/useTerminalToolbarActions'

describe('useTerminalToolbarActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refreshes command groups in every open terminal tab', () => {
    const refreshCom = vi.fn()
    const refreshTelnet = vi.fn()
    const refreshSsh = vi.fn()
    const options = {
      activeTabId: ref('telnet-1'),
      connectionTabs: ref([
        { id: 'com-1', connectionType: 'com', sessionId: 'COM1' },
        { id: 'telnet-1', connectionType: 'telnet', sessionId: 1 },
        { id: 'ssh-1', connectionType: 'ssh', sessionId: 2 },
        { id: 'settings-1', connectionType: 'settings', sessionId: 3 }
      ]),
      comTerminalRefs: { 'com-1': { refreshGroupsCmds: refreshCom } },
      telnetTerminalRefs: {
        'telnet-1': { refreshGroupsCmds: refreshTelnet },
        'ssh-1': { refreshGroupsCmds: refreshSsh }
      },
      terminalWordWrap: ref(false),
      terminalLineNumbers: ref(false),
      terminalLogEditable: ref(false),
      applyToAllTerminals: vi.fn(),
      saveTerminalDisplaySettings: vi.fn()
    }

    useTerminalToolbarActions(options).refreshHandler()

    expect(refreshCom).toHaveBeenCalledOnce()
    expect(refreshTelnet).toHaveBeenCalledOnce()
    expect(refreshSsh).toHaveBeenCalledOnce()
  })
})
