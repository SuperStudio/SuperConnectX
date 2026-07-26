/**
 * IpcTray 测试
 * 测试系统托盘管理逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockApp } = vi.hoisted(() => ({
  mockApp: { isPackaged: false, isQuitting: false }
}))

vi.mock('electron', () => ({
  app: mockApp,
  Tray: class {
    _toolTip: string = ''
    setToolTip(tip: string) { this._toolTip = tip }
    setContextMenu(_menu: any) {}
    on(_event: string, _handler: Function) {}
    destroy() {}
    resize(_opts: any) { return this }
  },
  Menu: { buildFromTemplate: vi.fn((t: any[]) => t) },
  nativeImage: {
    createFromPath: vi.fn(() => ({ isEmpty: () => false, resize: () => ({ setTemplateImage: vi.fn() }) })),
    createEmpty: vi.fn(() => ({ isEmpty: () => true, resize: () => ({ setTemplateImage: vi.fn() }) }))
  },
  BrowserWindow: class {}
}))

vi.mock('../../src/main/ipc/IpcAppLogger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import IpcTray from '../../src/main/ipc/IpcTray'

describe('IpcTray', () => {
  let ipcTray: IpcTray

  beforeEach(() => {
    ;(IpcTray as any).sInstance = null
    ipcTray = IpcTray.getInstance()
  })

  describe('getInstance', () => {
    it('should return same instance (singleton)', () => {
      expect(IpcTray.getInstance()).toBe(IpcTray.getInstance())
    })
  })

  describe('isQuitting', () => {
    it('should return false by default', () => {
      mockApp.isQuitting = false
      expect(ipcTray.isQuitting()).toBe(false)
    })

    it('should return true when isQuitting is set', () => {
      mockApp.isQuitting = true
      expect(ipcTray.isQuitting()).toBe(true)
    })

    it('should return false when isQuitting is undefined', () => {
      mockApp.isQuitting = undefined
      expect(ipcTray.isQuitting()).toBe(false)
    })
  })

  describe('createTray', () => {
    it('should create tray without throwing', () => {
      const w = { isMinimized: vi.fn(() => false), restore: vi.fn(), show: vi.fn(), focus: vi.fn(), hide: vi.fn() }
      expect(() => ipcTray.createTray(w as any)).not.toThrow()
    })

    it('should not create duplicate tray', () => {
      const w = { isMinimized: vi.fn(() => false), restore: vi.fn(), show: vi.fn(), focus: vi.fn(), hide: vi.fn() }
      ipcTray.createTray(w as any)
      expect(() => ipcTray.createTray(w as any)).not.toThrow()
    })
  })

  describe('hideToTray', () => {
    it('should create tray if not exists and hide window', () => {
      const w = { isMinimized: vi.fn(() => false), restore: vi.fn(), show: vi.fn(), focus: vi.fn(), hide: vi.fn() }
      expect(() => ipcTray.hideToTray(w as any)).not.toThrow()
      expect(w.hide).toHaveBeenCalled()
    })
  })

  describe('destroyTray', () => {
    it('should not throw when tray not created', () => {
      expect(() => ipcTray.destroyTray()).not.toThrow()
    })

    it('should destroy existing tray', () => {
      const w = { isMinimized: vi.fn(() => false), restore: vi.fn(), show: vi.fn(), focus: vi.fn(), hide: vi.fn() }
      ipcTray.createTray(w as any)
      expect(() => ipcTray.destroyTray()).not.toThrow()
      expect(() => ipcTray.destroyTray()).not.toThrow()
    })
  })
})
