/**
 * VirtualPortManager - 虚拟串口管理器
 *
 * 通过调用 com0com 的 setupc.exe 来管理虚拟串口对。
 * 需要在初始化时通过 init() 设置 setupc.exe 的路径。
 *
 * 对应 C# 版本 SuperCom.Entity.VirtualPortManager
 */
import { exec, ExecException, execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import VirtualPort from './VirtualPort'
import logger from '../ipc/IpcAppLogger'

export default class VirtualPortManager {
  private static sInstance: VirtualPortManager

  /** setupc.exe 的程序目录名 */
  static readonly PROGRAM_NAME = 'Null-modem emulator (com0com)'

  /** setupc.exe 文件名 */
  static readonly EXE_NAME = 'setupc.exe'

  /** 命令执行超时时间（毫秒） */
  static readonly CMD_TIMEOUT = 3000

  private appPath: string = ''
  private appDir: string = ''

  constructor() {}

  static getInstance(): VirtualPortManager {
    if (VirtualPortManager.sInstance == null) {
      VirtualPortManager.sInstance = new VirtualPortManager()
    }
    return VirtualPortManager.sInstance
  }

  /**
   * 初始化，设置 setupc.exe 的完整路径
   * @param appPath setupc.exe 的完整路径
   */
  init(appPath: string): void {
    this.appPath = appPath
    this.appDir = path.dirname(appPath)
    logger.info(`VirtualPortManager initialized, appPath=${appPath}`)
  }

  /** setupc.exe 是否已设置且文件存在 */
  isReady(): boolean {
    return this.appPath !== '' && fs.existsSync(this.appPath)
  }

  /** 获取 appPath */
  getAppPath(): string {
    return this.appPath
  }

  /**
   * 从 Windows 注册表自动检测 com0com 的安装路径
   *
   * 使用 reg query /s /f 在 Uninstall 注册表键中递归搜索 "com0com" 字符串，
   * 直接从搜索结果中解析 InstallLocation 并拼接 setupc.exe 路径。
   *
   * 对应 C# 版 RegistryHelper.GetInstalledApp()
   *
   * @returns 是否成功找到并初始化
   */
  autoDetect(): boolean {
    // 仅 Windows 支持注册表查询
    if (process.platform !== 'win32') {
      logger.info('VirtualPortManager autoDetect: non-Windows platform, skipping registry check')
      return false
    }

    const regKeys = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
    ]

    logger.info('VirtualPortManager autoDetect: searching registry for com0com...')

    for (const regKey of regKeys) {
      try {
        // /s 递归搜索子键, /f "com0com" 按数据内容搜索, /d 搜索数据值
        const output = execSync(
          `reg query "${regKey}" /s /f "com0com" /d 2>&1`,
          { encoding: 'utf-8', timeout: 5000 }
        )

        // 检查是否找到匹配
        if (output.includes('搜索结束: 找到 0 匹配') || !output.includes('InstallLocation')) {
          logger.info(`VirtualPortManager autoDetect: no match in ${regKey}`)
          continue
        }

        // 直接从输出中解析 InstallLocation
        const installMatch = output.match(/InstallLocation\s+REG_SZ\s+(.+)/i)
        if (!installMatch) {
          logger.info(`VirtualPortManager autoDetect: InstallLocation not found in ${regKey} output`)
          continue
        }

        const installLocation = installMatch[1].trim()
        logger.info(`VirtualPortManager autoDetect: InstallLocation=${installLocation}`)

        const exePath = path.join(installLocation, VirtualPortManager.EXE_NAME)
        if (!fs.existsSync(exePath)) {
          logger.error(`VirtualPortManager autoDetect: setupc.exe not found at ${exePath}`)
          continue
        }

        this.init(exePath)
        logger.info(`VirtualPortManager autoDetect: success, init with ${exePath}`)
        return true
      } catch (e) {
        logger.info(`VirtualPortManager autoDetect: failed to query ${regKey}: ${e}`)
      }
    }

    logger.info('VirtualPortManager autoDetect: com0com not found in registry')
    return false
  }

  // ==================== 命令解析 ====================

  /**
   * 解析单行 setupc.exe list 输出
   *
   * 格式示例：
   *   CNCA0 PortName=COM2,EmuBR=yes,EmuOverrun=yes
   *   CNCB0 PortName=COM4,EmuBR=yes,EmuOverrun=yes
   */
  static parseVirtualPort(line: string): VirtualPort | null {
    if (!line || !line.includes(' ')) return null

    line = line.trim()
    const spaceIndex = line.indexOf(' ')
    const id = line.substring(0, spaceIndex)
    const propsStr = line.substring(spaceIndex + 1)

    const port = new VirtualPort()
    port.ID = id

    const props = propsStr.split(',')
    for (const prop of props) {
      const eqIndex = prop.indexOf('=')
      if (eqIndex <= 0) continue

      const key = prop.substring(0, eqIndex).trim()
      const value = prop.substring(eqIndex + 1).trim()
      if (!key || !value) continue

      // PortName 映射到 Name
      if (key === 'PortName') {
        port.Name = value
        continue
      }

      // 通过属性名动态赋值
      const portAny = port as unknown as Record<string, unknown>
      if (key in portAny) {
        const currentVal = portAny[key]
        if (typeof currentVal === 'boolean') {
          portAny[key] = value.toLowerCase() === 'yes'
        } else if (typeof currentVal === 'number') {
          portAny[key] = parseFloat(value)
        } else if (typeof currentVal === 'string') {
          portAny[key] = value
        }
      }
    }

    return port
  }

  // ==================== 命令执行 ====================

  /**
   * 执行 setupc 命令，返回 stdout 的每一行
   */
  private execSetupCmd(args: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      if (!this.isReady()) {
        reject(new Error('setupc.exe not found or not initialized'))
        return
      }

      const cmd = `cd /d "${this.appDir}" && ${VirtualPortManager.EXE_NAME} ${args}`
      logger.info(`VirtualPortManager exec: ${cmd}`)

      exec(
        cmd,
        {
          timeout: VirtualPortManager.CMD_TIMEOUT,
          maxBuffer: 1024 * 1024, // 1MB
          windowsHide: true
        },
        (error: ExecException | null, stdout: string, stderr: string) => {
          if (stderr) {
            logger.info(`VirtualPortManager stderr: ${stderr}`)
          }
          if (error) {
            // setupc 某些情况下即使成功也可能返回非 0 退出码
            // 如果有 stdout 输出，仍然尝试返回
            if (stdout && stdout.trim()) {
              resolve(stdout.split('\n').map((l) => l.trim()).filter(Boolean))
              return
            }
            logger.error(`VirtualPortManager exec error: ${error.message}`)
            reject(error)
            return
          }
          const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean)
          resolve(lines)
        }
      )
    })
  }

  // ==================== 公共 API ====================

  /**
   * 列出所有虚拟串口对
   *
   * setupc.exe list 输出每两行为一对（CNCAx 和 CNCBx）
   * 返回的 VirtualPort 列表中相邻两个为一对
   */
  async listAllPorts(): Promise<VirtualPort[]> {
    const result: VirtualPort[] = []
    if (!this.isReady()) return result

    try {
      const lines = await this.execSetupCmd('list')
      for (const line of lines) {
        const port = VirtualPortManager.parseVirtualPort(line)
        if (port) {
          result.push(port)
        }
      }
      logger.info(`VirtualPortManager listAllPorts: found ${result.length} ports`)
    } catch (error) {
      logger.error(`VirtualPortManager listAllPorts failed: ${error}`)
    }

    return result
  }

  /**
   * 安装一对虚拟串口
   * @param portA 端口 A
   * @param portB 端口 B
   * @returns 是否成功
   */
  async insertPort(portA: VirtualPort, portB: VirtualPort): Promise<boolean> {
    if (!portA || !portB || !portA.Name || !portB.Name) return false
    if (!this.isReady()) return false

    try {
      const lines = await this.execSetupCmd(`install PortName=${portA.Name} PortName=${portB.Name}`)
      let count = 0
      for (const line of lines) {
        if (line.includes('logged as "in use"')) {
          count++
        }
      }
      const success = count === 2
      logger.info(`VirtualPortManager insertPort ${portA.Name}<->${portB.Name}: ${success}`)
      return success
    } catch (error) {
      logger.error(`VirtualPortManager insertPort failed: ${error}`)
      return false
    }
  }

  /**
   * 删除第 n 对虚拟串口
   * @param n 串口对索引（从 0 开始）
   * @returns 是否成功
   */
  async deletePort(n: number): Promise<boolean> {
    if (n < 0) return false
    if (!this.isReady()) return false

    try {
      const lines = await this.execSetupCmd(`remove ${n}`)
      let count = 0
      for (const line of lines) {
        if (line.includes(`Removed CNCA${n}`) || line.includes(`Removed CNCB${n}`)) {
          count++
        }
      }
      const success = count === 2
      logger.info(`VirtualPortManager deletePort ${n}: ${success}`)
      return success
    } catch (error) {
      logger.error(`VirtualPortManager deletePort failed: ${error}`)
      return false
    }
  }

  /**
   * 更新端口配置
   * @param ports 要更新的端口列表
   * @returns 是否全部成功
   */
  async updatePorts(ports: VirtualPort[]): Promise<boolean> {
    if (!this.isReady() || !ports || ports.length === 0) return false

    for (const port of ports) {
      const updateStr = port.toUpdateString()
      logger.info(`VirtualPortManager updatePorts: change ${port.ID} ${updateStr}`)

      try {
        const lines = await this.execSetupCmd(`change ${port.ID} ${updateStr}`)
        let completed = false
        for (const line of lines) {
          if (line.includes(`Restarted ${port.ID}`)) {
            completed = true
            break
          }
        }
        if (!completed) {
          logger.error(`VirtualPortManager updatePorts: change ${port.ID} did not restart`)
          return false
        }
      } catch (error) {
        logger.error(`VirtualPortManager updatePorts: change ${port.ID} failed: ${error}`)
        return false
      }
    }

    return true
  }
}
