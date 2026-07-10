/**
 * IpcWindow 测试
 * 测试窗口控制 IPC handler 注册逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted for variables used in vi.mock factory (hoisted)
const { mockHandlers, mockIpcMain } = vi.hoisted(() => {
  const handlers = new Map<string, Function>()
  return {
    mockHandlers: handlers,
    mockIpcMain: {
      _handlers: handlers,
      handle(channel: string, handler: Function) {
        handlers.set(channel, handler)
      }
    }
  }
})

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
  app: {
    getVersion: vi.fn(() => '1.0.0')
  }
}))

vi.mock('../../src/main/ipc/IpcAppLogger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('../../src/main/storage/SettingsStorage', () => ({
  default: class {
    getSettings() { return { minimizeToTray: false } }
  }
}))

vi.mock('../../src/main/ipc/IpcTray', () => ({
  default: {
    getInstance() {
      return { hideToTray: vi.fn(), createTray: vi.fn(), destroyTray: vi.fn() }
    }
  }
}))

import IpcWindow from '../../src/main/ipc/IpcWindow'

describe('IpcWindow', () => {
  let ipcWindow: IpcWindow
  let mockWindows: any

  beforeEach(() => {
    ;(IpcWindow as any).sInstance = null
    ipcWindow = IpcWindow.getInstance()
    mockHandlers.clear()

    mockWindows = {
      mainWindow: {
        minimize: vi.fn(),
        close: vi.fn(),
        isMaximized: vi.fn(() => false),
        maximize: vi.fn(),
        unmaximize: vi.fn(),
        isFullScreen: vi.fn(() => false),
        setFullScreen: vi.fn()
      }
    }
  })

  describe('getInstance', () => {
    it('should return same instance (singleton)', () => {
      expect(IpcWindow.getInstance()).toBe(IpcWindow.getInstance())
    })
  })

  describe('init()', () => {
    it('should register all window control handlers', () => {
      ipcWindow.init(mockWindows)
      expect(mockHandlers.has('minimize-window')).toBe(true)
      expect(mockHandlers.has('close-window')).toBe(true)
      expect(mockHandlers.has('get-window-state')).toBe(true)
      expect(mockHandlers.has('maximize-window')).toBe(true)
      expect(mockHandlers.has('get-app-version')).toBe(true)
      expect(mockHandlers.has('toggle-fullscreen-window')).toBe(true)
    })

    it('should minimize window on minimize-window', async () => {
      ipcWindow.init(mockWindows)
      await mockHandlers.get('minimize-window')!()
      expect(mockWindows.mainWindow.minimize).toHaveBeenCalled()
    })

    it('should close window when minimizeToTray is false', async () => {
      ipcWindow.init(mockWindows)
      await mockHandlers.get('close-window')!()
      expect(mockWindows.mainWindow.close).toHaveBeenCalled()
    })

    it('should return window state on get-window-state', async () => {
      ipcWindow.init(mockWindows)
      mockWindows.mainWindow.isMaximized.mockReturnValue(false)
      expect(await mockHandlers.get('get-window-state')!()).toBe(false)
      mockWindows.mainWindow.isMaximized.mockReturnValue(true)
      expect(await mockHandlers.get('get-window-state')!()).toBe(true)
    })

    it('should maximize on maximize-window when not maximized', async () => {
      ipcWindow.init(mockWindows)
      mockWindows.mainWindow.isMaximized.mockReturnValue(false)
      await mockHandlers.get('maximize-window')!()
      expect(mockWindows.mainWindow.maximize).toHaveBeenCalled()
    })

    it('should unmaximize on maximize-window when maximized', async () => {
      ipcWindow.init(mockWindows)
      mockWindows.mainWindow.isMaximized.mockReturnValue(true)
      await mockHandlers.get('maximize-window')!()
      expect(mockWindows.mainWindow.unmaximize).toHaveBeenCalled()
    })

    it('should return app version on get-app-version', async () => {
      ipcWindow.init(mockWindows)
      expect(await mockHandlers.get('get-app-version')!()).toBe('1.0.0')
    })

    it('should toggle fullscreen', async () => {
      ipcWindow.init(mockWindows)
      mockWindows.mainWindow.isFullScreen.mockReturnValue(false)
      await mockHandlers.get('toggle-fullscreen-window')!()
      expect(mockWindows.mainWindow.setFullScreen).toHaveBeenCalledWith(true)
    })

    it('should untoggle fullscreen when already fullscreen', async () => {
      ipcWindow.init(mockWindows)
      mockWindows.mainWindow.isFullScreen.mockReturnValue(true)
      await mockHandlers.get('toggle-fullscreen-window')!()
      expect(mockWindows.mainWindow.setFullScreen).toHaveBeenCalledWith(false)
    })

    it('should handle null mainWindow gracefully', async () => {
      ipcWindow.init({ mainWindow: null })
      // When mainWindow is null, optional chaining returns undefined (not a Promise)
      const minimizeResult = mockHandlers.get('minimize-window')!()
      expect(minimizeResult).toBeUndefined()
      const stateResult = mockHandlers.get('get-window-state')!()
      expect(stateResult).toBeUndefined()
    })
  })
})
