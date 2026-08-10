import { ipcMain } from 'electron'
import { SerialPort } from 'serialport'
import { execSync } from 'child_process'
import logger from './IpcAppLogger'

/** 主进程窗口集合（仅需 mainWindow.webContents.send 能力） */
interface WindowsRef {
  mainWindow?: { webContents?: { send: (channel: string, ...args: unknown[]) => void } } | null
}

export default class IpcSerialPort {
  private static sInstance: IpcSerialPort
  private windows: WindowsRef | null = null
  private hotplugTimer: NodeJS.Timeout | null = null
  private lastPortSignature = ''
  private readonly HOTPLUG_INTERVAL_MS = 2000

  constructor() {}

  static getInstance(): IpcSerialPort {
    if (IpcSerialPort.sInstance == null) {
      IpcSerialPort.sInstance = new IpcSerialPort()
    }
    return IpcSerialPort.sInstance
  }

  async listSerialPorts(logResult: boolean = true): Promise<object[]> {
    try {
      const ports = await SerialPort.list()
      if (logResult) logger.info(`serialport.list() returned ${ports.length} ports`)

      const platform = process.platform

      const filtered = ports.filter((port) => {
        const path = port.path || ''

        // Linux: keep physical serial adapters and explicitly supported GPIO/Bluetooth devices.
        if (platform === 'linux') {
          if (path.startsWith('/dev/ttyS')) {
            return !!(port.manufacturer || port.serialNumber || port.pnpId)
          }
          if (
            path.startsWith('/dev/ttyUSB') ||
            path.startsWith('/dev/ttyACM') ||
            path.startsWith('/dev/ttyAMA') ||
            path.startsWith('/dev/rfcomm')
          ) {
            return true
          }
          return false
        }

        // Windows: keep all COM ports. Software-virtualised serial ports (com0com,
        // Eltima, VSPD, etc.) are also valid ports users may want to connect to.
        if (platform === 'win32') {
          return true
        }

        // macOS: exclude Apple's virtual Bluetooth-incoming port.
        if (platform === 'darwin') {
          return !path.endsWith('.Bluetooth-Incoming-Port')
        }

        return false
      })

      // Windows: supplement with ports from registry that serialport may miss.
      // Some virtual serial port drivers (e.g. com0com) only register in
      // HKLM\HARDWARE\DEVICEMAP\SERIALCOMM but have no SetupAPI device node,
      // so SerialPort.list() won't pick them up.
      if (platform === 'win32') {
        const registryPorts = this.getWindowsRegistryPorts(logResult)
        const existingPaths = new Set(filtered.map((p) => (p.path || '').toUpperCase()))
        for (const regPort of registryPorts) {
          if (!existingPaths.has(regPort.path.toUpperCase())) {
            filtered.push(regPort)
            existingPaths.add(regPort.path.toUpperCase())
          }
        }
      }

      const uniquePorts = filtered.filter(
        (port, index, allPorts) => allPorts.findIndex((candidate) => candidate.path === port.path) === index
      )

      if (logResult) logger.info(`filtered to ${uniquePorts.length} serial ports`)
      return uniquePorts.map((port) => ({
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber,
        pnpId: port.pnpId,
        locationId: port.locationId,
        friendlyName: port.friendlyName,
        vendorId: port.vendorId,
        productId: port.productId
      }))
    } catch (error) {
      logger.error(`list serial ports failed: ${error}`)
      return []
    }
  }

  /**
   * Windows: read COM port mappings from the registry.
   * Returns ports that serialport's SetupAPI enumeration might miss
   * (e.g. com0com virtual ports that only have a registry entry).
   */
  private getWindowsRegistryPorts(logResult: boolean = true): { path: string }[] {
    try {
      const regOutput = execSync(
        'reg query "HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM" 2>&1',
        { encoding: 'utf-8', timeout: 3000 }
      )
      const ports: { path: string }[] = []
      // Each line looks like: "    \\Device\\com0com10    REG_SZ    COM55"
      const re = /REG_SZ\s+(COM\d+)/gi
      let match: RegExpExecArray | null
      while ((match = re.exec(regOutput)) !== null) {
        ports.push({ path: match[1] })
      }
      if (logResult) logger.info(`registry supplement: found ${ports.length} ports from SERIALCOMM`)
      return ports
    } catch {
      if (logResult) logger.info('registry supplement: failed to read SERIALCOMM')
      return []
    }
  }

  /**
   * 启动串口热插拔监听：轮询串口列表，仅在列表变化时通知渲染进程刷新。
   * 采用轮询而非原生事件（WM_DEVICECHANGE / udev / IOKit），无需额外原生依赖，跨平台行为一致。
   */
  startHotplugWatch(): void {
    if (this.hotplugTimer) return

    // 先记录基线：渲染进程启动时会自行加载一次列表，避免启动后立即触发一次无谓刷新
    this.listSerialPorts(false)
      .then((ports) => {
        this.lastPortSignature = this.buildPortSignature(ports)
      })
      .catch(() => {})

    this.hotplugTimer = setInterval(() => {
      this.checkPortChanges().catch(() => {})
    }, this.HOTPLUG_INTERVAL_MS)
    this.hotplugTimer.unref?.() // 不阻止进程退出
    logger.info('serial port hotplug watch started')
  }

  stopHotplugWatch(): void {
    if (this.hotplugTimer) {
      clearInterval(this.hotplugTimer)
      this.hotplugTimer = null
    }
  }

  private buildPortSignature(ports: object[]): string {
    return ports
      .map((p) => (p as { path?: string }).path || '')
      .sort()
      .join('|')
  }

  private async checkPortChanges(): Promise<void> {
    const ports = await this.listSerialPorts(false)
    const signature = this.buildPortSignature(ports)
    if (signature === this.lastPortSignature) return

    const oldSignature = this.lastPortSignature
    this.lastPortSignature = signature
    logger.info(`serial ports changed: [${oldSignature}] -> [${signature}]`)
    this.windows?.mainWindow?.webContents?.send('on-serial-ports-changed', ports)
  }

  init(_logger: unknown, windows: WindowsRef): void {
    this.windows = windows

    ipcMain.handle('list-serial-ports', async () => {
      return await this.listSerialPorts()
    })

    this.startHotplugWatch()

    logger.info(`init IpcSerialPort done`)
  }
}
