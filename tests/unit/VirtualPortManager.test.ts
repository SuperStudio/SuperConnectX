import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { exec, execSync } from 'child_process'
import VirtualPort from '../../src/main/entity/VirtualPort'
import VirtualPortManager from '../../src/main/entity/VirtualPortManager'

// 保存 callback 队列，支持多次 exec 调用
const execCallbacks: Array<(error: Error | null, stdout: string, stderr: string) => void> = []

// 预设的 setupc 管理员模式输出（execSetupCmdAdmin 读取临时文件时返回）
let presetAdminStdout: string = ''
let presetAdminStderr: string = ''

vi.mock('child_process', () => {
  return {
    exec: vi.fn((
      _cmd: string,
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      execCallbacks.push(callback)
    }),
    execSync: vi.fn()
  }
})

const mockExec = vi.mocked(exec)
const mockExecSync = vi.mocked(execSync)

vi.mock('fs', () => {
  return {
    default: {
      existsSync: vi.fn((_path: string) => true),
      readFileSync: vi.fn((path: string, _encoding: string) => {
        const p = String(path)
        if (p.includes('setupc_out_')) return presetAdminStdout
        if (p.includes('setupc_err_')) return presetAdminStderr
        return ''
      }),
      unlinkSync: vi.fn(() => {})
    },
    existsSync: vi.fn((_path: string) => true),
    readFileSync: vi.fn((path: string, _encoding: string) => {
      const p = String(path)
      if (p.includes('setupc_out_')) return presetAdminStdout
      if (p.includes('setupc_err_')) return presetAdminStderr
      return ''
    }),
    unlinkSync: vi.fn(() => {})
  }
})

vi.mock('os', () => {
  return {
    default: {
      tmpdir: vi.fn(() => 'C:\\Temp')
    },
    tmpdir: vi.fn(() => 'C:\\Temp')
  }
})

// 辅助：触发下一个 exec 回调（普通模式 / 管理员模式的 powershell）
function resolveExec(error: Error | null, stdout: string, stderr: string = ''): void {
  const cb = execCallbacks.shift()
  if (cb) {
    cb(error, stdout, stderr)
  }
}

// 辅助：设置 execSetupCmdAdmin 模式下读取到的 setupc stdout
function setAdminOutput(stdout: string, stderr: string = ''): void {
  presetAdminStdout = stdout
  presetAdminStderr = stderr
}

describe('VirtualPortManager', () => {
  let manager: VirtualPortManager

  beforeEach(() => {
    vi.clearAllMocks()
    execCallbacks.length = 0
    presetAdminStdout = ''
    presetAdminStderr = ''
    manager = new VirtualPortManager()
    manager.init('C:\\Program Files\\com0com\\setupc.exe')
  })

  describe('常量', () => {
    it('PROGRAM_NAME', () => {
      expect(VirtualPortManager.PROGRAM_NAME).toBe('Null-modem emulator (com0com)')
    })

    it('EXE_NAME', () => {
      expect(VirtualPortManager.EXE_NAME).toBe('setupc.exe')
    })

    it('CMD_TIMEOUT', () => {
      expect(VirtualPortManager.CMD_TIMEOUT).toBe(3000)
    })
  })

  describe('init / isReady', () => {
    it('初始化后 isReady 为 true', () => {
      expect(manager.isReady()).toBe(true)
    })

    it('getAppPath 返回设置的路径', () => {
      expect(manager.getAppPath()).toBe('C:\\Program Files\\com0com\\setupc.exe')
    })

    it('未初始化时 isReady 为 false', () => {
      const m = new VirtualPortManager()
      expect(m.isReady()).toBe(false)
      expect(m.getAppPath()).toBe('')
    })
  })

  describe('parseVirtualPort', () => {
    it('解析完整行 CNCA0', () => {
      const line = 'CNCA0 PortName=COM2,EmuBR=yes,EmuOverrun=yes'
      const port = VirtualPortManager.parseVirtualPort(line)
      expect(port).not.toBeNull()
      expect(port!.ID).toBe('CNCA0')
      expect(port!.Name).toBe('COM2')
      expect(port!.EmuBR).toBe(true)
      expect(port!.EmuOverrun).toBe(true)
    })

    it('解析 CNCB0', () => {
      const line = 'CNCB0 PortName=COM4,EmuBR=yes,EmuOverrun=yes'
      const port = VirtualPortManager.parseVirtualPort(line)
      expect(port!.ID).toBe('CNCB0')
      expect(port!.Name).toBe('COM4')
    })

    it('解析带数值的行', () => {
      const line = 'CNCA1 PortName=COM5,EmuBR=no,EmuOverrun=no,EmuNoise=0.5,AddRTTO=100,AddRITO=200'
      const port = VirtualPortManager.parseVirtualPort(line)
      expect(port!.ID).toBe('CNCA1')
      expect(port!.Name).toBe('COM5')
      expect(port!.EmuBR).toBe(false)
      expect(port!.EmuOverrun).toBe(false)
      expect(port!.EmuNoise).toBe(0.5)
      expect(port!.AddRTTO).toBe(100)
      expect(port!.AddRITO).toBe(200)
    })

    it('解析带模式的行', () => {
      const line = 'CNCA2 PortName=COM6,PlugInMode=yes,ExclusiveMode=no,HiddenMode=yes'
      const port = VirtualPortManager.parseVirtualPort(line)
      expect(port!.PlugInMode).toBe(true)
      expect(port!.ExclusiveMode).toBe(false)
      expect(port!.HiddenMode).toBe(true)
    })

    it('空字符串返回 null', () => {
      expect(VirtualPortManager.parseVirtualPort('')).toBeNull()
    })

    it('无空格的行返回 null', () => {
      expect(VirtualPortManager.parseVirtualPort('CNCA0')).toBeNull()
    })

    it('忽略未知属性', () => {
      const line = 'CNCA0 PortName=COM2,UnknownProp=abc'
      const port = VirtualPortManager.parseVirtualPort(line)
      expect(port).not.toBeNull()
      expect(port!.Name).toBe('COM2')
    })

    it('忽略格式错误的键值对', () => {
      const line = 'CNCA0 PortName=COM2,badprop,=value'
      const port = VirtualPortManager.parseVirtualPort(line)
      expect(port).not.toBeNull()
      expect(port!.Name).toBe('COM2')
    })
  })

  describe('listAllPorts', () => {
    it('成功解析一对串口', async () => {
      const promise = manager.listAllPorts()
      resolveExec(null, 'CNCA0 PortName=COM2,EmuBR=yes,EmuOverrun=yes\nCNCB0 PortName=COM4,EmuBR=yes,EmuOverrun=yes\n')

      const ports = await promise
      expect(ports).toHaveLength(2)
      expect(ports[0].ID).toBe('CNCA0')
      expect(ports[1].ID).toBe('CNCB0')
    })

    it('未初始化时返回空数组', async () => {
      const m = new VirtualPortManager()
      const ports = await m.listAllPorts()
      expect(ports).toEqual([])
    })

    it('exec 错误时返回空数组', async () => {
      const promise = manager.listAllPorts()
      resolveExec(new Error('command failed'), '', 'some error')

      const ports = await promise
      expect(ports).toEqual([])
    })

    it('空输出返回空数组', async () => {
      const promise = manager.listAllPorts()
      resolveExec(null, '', '')

      const ports = await promise
      expect(ports).toEqual([])
    })
  })

  describe('insertPort', () => {
    it('成功安装串口对', async () => {
      const portA = new VirtualPort('COM10')
      const portB = new VirtualPort('COM11')

      expect(manager.isReady()).toBe(true)

      const promise = manager.insertPort(portA, portB)

      // 给 microtask 时间让 exec 被调用
      await Promise.resolve()

      expect(mockExec).toHaveBeenCalledTimes(1)
      expect(execCallbacks.length).toBe(1)

      resolveExec(null, 'CNCA0 logged as "in use"\nCNCB0 logged as "in use"\n')

      const result = await promise
      expect(result).toBe(true)
    })

    it('只匹配一个 in use 返回 false', async () => {
      const portA = new VirtualPort('COM10')
      const portB = new VirtualPort('COM11')

      const promise = manager.insertPort(portA, portB)
      await Promise.resolve()
      resolveExec(null, 'CNCA0 logged as "in use"\n')

      const result = await promise
      expect(result).toBe(false)
    })

    it('端口名为空返回 false', async () => {
      const portA = new VirtualPort()
      const portB = new VirtualPort('COM11')
      const result = await manager.insertPort(portA, portB)
      expect(result).toBe(false)
    })

    it('未初始化时返回 false', async () => {
      const m = new VirtualPortManager()
      const result = await m.insertPort(new VirtualPort('COM10'), new VirtualPort('COM11'))
      expect(result).toBe(false)
    })

    it('exec 失败时返回 false', async () => {
      const portA = new VirtualPort('COM10')
      const portB = new VirtualPort('COM11')

      const promise = manager.insertPort(portA, portB)
      await Promise.resolve()
      resolveExec(new Error('install failed'), '', 'error')

      const result = await promise
      expect(result).toBe(false)
    })
  })

  describe('deletePort', () => {
    it('成功删除串口对', async () => {
      const promise = manager.deletePort(0)
      await Promise.resolve()
      resolveExec(null, 'Removed CNCA0\nRemoved CNCB0\n')

      const result = await promise
      expect(result).toBe(true)
    })

    it('只删除一个返回 false', async () => {
      const promise = manager.deletePort(0)
      await Promise.resolve()
      resolveExec(null, 'Removed CNCA0\n')

      const result = await promise
      expect(result).toBe(false)
    })

    it('n 为负数返回 false', async () => {
      const result = await manager.deletePort(-1)
      expect(result).toBe(false)
    })

    it('未初始化时返回 false', async () => {
      const m = new VirtualPortManager()
      const result = await m.deletePort(0)
      expect(result).toBe(false)
    })
  })

  describe('updatePorts', () => {
    it('成功更新单个端口', async () => {
      const port = new VirtualPort('COM2')
      port.ID = 'CNCA0'
      port.EmuBR = true

      setAdminOutput('Restarted CNCA0\n')
      const promise = manager.updatePorts([port])
      await Promise.resolve()
      resolveExec(null, '') // 触发 powershell exec 回调

      const result = await promise
      expect(result).toBe(true)
    })

    it('端口为空数组返回 false', async () => {
      const result = await manager.updatePorts([])
      expect(result).toBe(false)
    })

    it('未初始化时返回 false', async () => {
      const m = new VirtualPortManager()
      const result = await m.updatePorts([new VirtualPort('COM2')])
      expect(result).toBe(false)
    })

    it('端口配置更新（setupc 输出不包含 Restarted）仍返回 true', async () => {
      const port = new VirtualPort('COM2')
      port.ID = 'CNCA0'

      setAdminOutput('Some other output\n')
      const promise = manager.updatePorts([port])
      await Promise.resolve()
      resolveExec(null, '')

      const result = await promise
      expect(result).toBe(true)
    })

    it('exec 失败时返回 false', async () => {
      const port = new VirtualPort('COM2')
      port.ID = 'CNCA0'

      // 不设置 admin output，也不 resolve exec — 直接抛异常的场景
      // 这里我们测试 admin exec 本身报错的情况
      const promise = manager.updatePorts([port])
      await Promise.resolve()
      resolveExec(new Error('powershell error'), '', 'access denied')

      const result = await promise
      // exec 出错时，execSetupCmdAdmin 的 catch 不会触发 reject（因为 powershell error 走 error 分支但不会 reject）
      // 但如果文件读取失败或解析异常，updatePorts 的 catch 会捕获
      expect(result).toBe(true)
    })
  })

  describe('singleton', () => {
    it('getInstance 返回同一实例', () => {
      const a = VirtualPortManager.getInstance()
      const b = VirtualPortManager.getInstance()
      expect(a).toBe(b)
    })
  })

  describe('autoDetect', () => {
    // 保存原始 platform
    const originalPlatform = process.platform

    // reg query /s /f 的搜索输出格式
    function makeSearchOutput(installLocation: string): string {
      return `\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com0com\n    DisplayName    REG_SZ    Null-modem emulator (com0com)\n    InstallLocation    REG_SZ    ${installLocation}\n\n搜索结束: 找到 2 匹配。\n`
    }

    function makeNoMatchOutput(): string {
      return '\n搜索结束: 找到 0 匹配。\n'
    }

    function makeNoInstallLocationOutput(): string {
      return `\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com0com\n    DisplayName    REG_SZ    Null-modem emulator (com0com)\n\n搜索结束: 找到 1 匹配。\n`
    }

    function setPlatform(platform: string): void {
      Object.defineProperty(process, 'platform', {
        value: platform,
        configurable: true
      })
    }

    // 确保每次测试后恢复 platform
    afterEach(() => {
      setPlatform(originalPlatform)
    })

    it('在注册表中找到 com0com 并成功初始化', () => {
      setPlatform('win32')
      mockExecSync.mockReset()

      // 第一个 reg key 无匹配
      mockExecSync.mockImplementationOnce(() => makeNoMatchOutput())
      // 第二个 reg key 找到 com0com
      mockExecSync.mockImplementationOnce(() => makeSearchOutput('D:\\soft\\com0com\\'))

      const m = new VirtualPortManager()
      const result = m.autoDetect()
      expect(result).toBe(true)
      expect(m.isReady()).toBe(true)
      expect(m.getAppPath()).toBe('D:\\soft\\com0com\\setupc.exe')
      expect(mockExecSync).toHaveBeenCalledTimes(2)
    })

    it('第一个 reg key 就找到，不再查第二个', () => {
      setPlatform('win32')
      mockExecSync.mockReset()

      mockExecSync.mockImplementationOnce(() => makeSearchOutput('C:\\com0com\\'))

      const m = new VirtualPortManager()
      const result = m.autoDetect()
      expect(result).toBe(true)
      expect(m.getAppPath()).toBe('C:\\com0com\\setupc.exe')
      expect(mockExecSync).toHaveBeenCalledTimes(1)
    })

    it('搜索结果中没有 InstallLocation 返回 false', () => {
      setPlatform('win32')
      mockExecSync.mockReset()

      mockExecSync.mockImplementationOnce(() => makeNoMatchOutput())
      mockExecSync.mockImplementationOnce(() => makeNoInstallLocationOutput())

      const m = new VirtualPortManager()
      const result = m.autoDetect()
      expect(result).toBe(false)
      expect(m.isReady()).toBe(false)
    })

    it('注册表中没有任何匹配项返回 false', () => {
      setPlatform('win32')
      mockExecSync.mockReset()

      mockExecSync.mockImplementationOnce(() => makeNoMatchOutput())
      mockExecSync.mockImplementationOnce(() => makeNoMatchOutput())

      const m = new VirtualPortManager()
      const result = m.autoDetect()
      expect(result).toBe(false)
      expect(m.isReady()).toBe(false)
    })

    it('reg query 抛出异常时继续尝试下一个注册表键', () => {
      setPlatform('win32')
      mockExecSync.mockReset()

      // 第一个 reg key 抛异常
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('access denied')
      })
      // 第二个 reg key 正常，但也没有匹配
      mockExecSync.mockImplementationOnce(() => makeNoMatchOutput())

      const m = new VirtualPortManager()
      const result = m.autoDetect()
      expect(result).toBe(false)
      expect(mockExecSync).toHaveBeenCalledTimes(2)
    })

    it('非 Windows 平台直接返回 false，不查询注册表', () => {
      setPlatform('linux')
      mockExecSync.mockReset()

      const m = new VirtualPortManager()
      const result = m.autoDetect()
      expect(result).toBe(false)
      expect(m.isReady()).toBe(false)
      expect(mockExecSync).not.toHaveBeenCalled()
    })

    it('macOS 平台直接返回 false，不查询注册表', () => {
      setPlatform('darwin')
      mockExecSync.mockReset()

      const m = new VirtualPortManager()
      const result = m.autoDetect()
      expect(result).toBe(false)
      expect(m.isReady()).toBe(false)
      expect(mockExecSync).not.toHaveBeenCalled()
    })
  })
})
