import { ipcMain } from 'electron'
import VirtualPortManager from '../entity/VirtualPortManager'
import logger from './IpcAppLogger'

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
        // 条件1: setupc.exe 已设置路径且文件存在
        installed: ready,
        // 条件2: 路径是否已选择（设置了 appPath）
        pathSelected: appPath !== '',
        // 当前已设置的路径
        path: appPath
      }
    })

    // 列出所有虚拟串口对
    ipcMain.handle('virtualport:list-ports', async () => {
      const ports = await manager.listAllPorts()
      logger.info(`virtualport:list-ports - found ${ports.length} ports`)

      // 每两个端口为一对，组装成 pair 数组
      const pairs: Array<{ index: number; portA: string; portB: string }> = []
      for (let i = 0; i + 1 < ports.length; i += 2) {
        pairs.push({
          index: i / 2,
          portA: ports[i].Name,
          portB: ports[i + 1].Name
        })
      }

      return pairs
    })

    logger.info('init IpcVirtualPort done')
  }
}
