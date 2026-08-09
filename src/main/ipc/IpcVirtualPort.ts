import { ipcMain, shell } from 'electron'
import path from 'path'
import VirtualPort from '../entity/VirtualPort'
import VirtualPortManager from '../entity/VirtualPortManager'
import logger from './IpcAppLogger'

/** 序列化 VirtualPort 为纯对象，去除 prototype（IPC 要求 plain object） */
function serializePort(port: VirtualPort): Record<string, unknown> {
  return {
    ID: port.ID,
    Name: port.Name,
    EmuBR: port.EmuBR,
    EmuOverrun: port.EmuOverrun,
    EmuNoise: port.EmuNoise,
    AddRTTO: port.AddRTTO,
    AddRITO: port.AddRITO,
    PlugInMode: port.PlugInMode,
    ExclusiveMode: port.ExclusiveMode,
    HiddenMode: port.HiddenMode
  }
}

export default class IpcVirtualPort {
  private static sInstance: IpcVirtualPort

  constructor() {}

  static getInstance(): IpcVirtualPort {
    if (IpcVirtualPort.sInstance == null) {
      IpcVirtualPort.sInstance = new IpcVirtualPort()
    }
    return IpcVirtualPort.sInstance
  }

  init(_logger: any, _windows: any): void {
    const manager = VirtualPortManager.getInstance()

    // 检测两个虚拟串口条件
    ipcMain.handle('virtualport:check-conditions', async () => {
      // 如果尚未初始化，先尝试自动检测 setupc.exe 路径
      if (!manager.isReady()) {
        logger.info('virtualport:check-conditions - not ready, attempting autoDetect...')
        const detected = manager.autoDetect()
        logger.info(`virtualport:check-conditions - autoDetect result: ${detected}`)
      }

      const appPath = manager.getAppPath()
      const ready = manager.isReady()
      logger.info(`virtualport:check-conditions - installed=${ready}, pathSelected=${appPath !== ''}, path=${appPath}`)

      return {
        installed: ready,
        pathSelected: appPath !== '',
        path: appPath
      }
    })

    // 列出所有虚拟串口（每个端口一行，携带完整参数）
    ipcMain.handle('virtualport:list-ports', async () => {
      const ports = await manager.listAllPorts()
      logger.info(`virtualport:list-ports - found ${ports.length} ports`)

      return ports.map((p) => serializePort(p))
    })

    // 新增串口对
    ipcMain.handle('virtualport:insert-pair', async (_event, portA: string, portB: string) => {
      logger.info(`virtualport:insert-pair - portA=${portA}, portB=${portB}`)

      if (!manager.isReady()) {
        logger.error('virtualport:insert-pair - manager not ready')
        return { success: false, error: 'setupc.exe not found' }
      }

      const vpA = new VirtualPort(portA)
      const vpB = new VirtualPort(portB)

      const result = await manager.insertPort(vpA, vpB)
      logger.info(`virtualport:insert-pair - result: ${result}`)
      return { success: result }
    })

    // 删除串口对
    ipcMain.handle('virtualport:delete-pair', async (_event, index: number) => {
      logger.info(`virtualport:delete-pair - index=${index}`)

      if (!manager.isReady()) {
        logger.error('virtualport:delete-pair - manager not ready')
        return { success: false, error: 'setupc.exe not found' }
      }

      const result = await manager.deletePort(index)
      logger.info(`virtualport:delete-pair - result: ${result}`)
      return { success: result }
    })

    // 运行 setup.exe 安装程序
    ipcMain.handle('virtualport:run-setup', async () => {
      // 在打包后的应用中，extraResources 会被放到 process.resourcesPath 下
      const setupPath = path.join(process.resourcesPath!, 'exe', 'setup.exe')
      logger.info(`virtualport:run-setup - launching ${setupPath}`)
      try {
        await shell.openPath(setupPath)
        return { success: true }
      } catch (e) {
        logger.error(`virtualport:run-setup - failed: ${e}`)
        return { success: false, error: String(e) }
      }
    })

    // 更新端口配置
    ipcMain.handle('virtualport:update-ports', async (_event, ports: Array<Record<string, unknown>>) => {
      logger.info(`virtualport:update-ports - updating ${ports.length} ports`)

      if (!manager.isReady()) {
        logger.error('virtualport:update-ports - manager not ready')
        return { success: false, error: 'setupc.exe not found' }
      }

      const vps: VirtualPort[] = []
      for (const p of ports) {
        const vp = new VirtualPort()
        vp.ID = p.ID as string
        vp.Name = p.Name as string
        vp.EmuBR = !!p.EmuBR
        vp.EmuOverrun = !!p.EmuOverrun
        vp.EmuNoise = Number(p.EmuNoise) || 0
        vp.AddRTTO = Number(p.AddRTTO) || 0
        vp.AddRITO = Number(p.AddRITO) || 0
        vp.PlugInMode = !!p.PlugInMode
        vp.ExclusiveMode = !!p.ExclusiveMode
        vp.HiddenMode = !!p.HiddenMode
        vps.push(vp)
      }

      const result = await manager.updatePorts(vps)
      logger.info(`virtualport:update-ports - result: ${result}`)
      return { success: result }
    })

    logger.info('init IpcVirtualPort done')
  }
}
