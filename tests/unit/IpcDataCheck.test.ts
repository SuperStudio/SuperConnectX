import { describe, it, expect } from 'vitest'

// IpcDataCheck is a thin wrapper around DataCheckEngine
// We test the class structure and singleton pattern here

describe('IpcDataCheck', () => {
  it('should be a class with getInstance static method', async () => {
    const IpcDataCheck = (await import('../../src/main/ipc/IpcDataCheck')).default
    expect(typeof IpcDataCheck.getInstance).toBe('function')
  })

  it('getInstance should return same instance', async () => {
    const IpcDataCheck = (await import('../../src/main/ipc/IpcDataCheck')).default
    const i1 = IpcDataCheck.getInstance()
    const i2 = IpcDataCheck.getInstance()
    expect(i1).toBe(i2)
  })

  it('should have init method', async () => {
    const IpcDataCheck = (await import('../../src/main/ipc/IpcDataCheck')).default
    const instance = IpcDataCheck.getInstance()
    expect(typeof instance.init).toBe('function')
  })

  it('init should not throw', async () => {
    const IpcDataCheck = (await import('../../src/main/ipc/IpcDataCheck')).default
    const instance = IpcDataCheck.getInstance()
    // init registers ipcMain handlers, which should work with our mock
    expect(() => instance.init()).not.toThrow()
  })
})
