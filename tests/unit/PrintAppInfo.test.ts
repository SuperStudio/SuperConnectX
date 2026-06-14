import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the logger
vi.mock('../../src/main/ipc/IpcAppLogger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

describe('PrintAppInfo', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('printAppInfo 不传 mainWindow 时不抛错', async () => {
    const { printAppInfo } = await import('../../src/main/utils/PrintAppInfo')
    expect(() => printAppInfo()).not.toThrow()
  })

  it('printAppInfo 传入 mock mainWindow 时不抛错', async () => {
    const { printAppInfo } = await import('../../src/main/utils/PrintAppInfo')
    const mockWindow = {
      id: 1,
      getBounds: () => ({ x: 0, y: 0, width: 1024, height: 768 }),
      isFullScreen: () => false,
      isMaximized: () => true,
      isMinimized: () => false,
      webContents: {
        id: 2,
        getURL: () => 'http://localhost',
        isLoading: () => false
      },
      getTitle: () => 'SuperConnectX'
    }
    expect(() => printAppInfo(mockWindow as any)).not.toThrow()
  })

  it('printAppInfo 处理各种边界情况', async () => {
    const { printAppInfo } = await import('../../src/main/utils/PrintAppInfo')
    // minimal window with all required methods
    const minimalWindow = {
      id: 0,
      getBounds: () => ({}),
      isFullScreen: () => false,
      isMaximized: () => false,
      isMinimized: () => false,
      webContents: {
        id: 0,
        getURL: () => '',
        isLoading: () => false
      },
      getTitle: () => ''
    }
    expect(() => printAppInfo(minimalWindow as any)).not.toThrow()
  })
})
