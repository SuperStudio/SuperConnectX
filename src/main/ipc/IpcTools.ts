import os from 'os'
import { shell, ipcMain, app } from 'electron'
import logger from './IpcAppLogger'
import fs from 'fs'
import path from 'path'

const MAX_CPU_VALUE = 100
const CPU_FLOAT_FIXED_SIZE = 2
const MEM_FLOAT_FIXED_SIZE = 2
const BYTE_VALUE_SIZE = 1024
const FLOAT_TO_PERCENT = 100

export default class IpcTools {
  private static sInstance: IpcTools

  constructor() {}

  static getInstance(): IpcTools {
    if (IpcTools.sInstance == null) {
      IpcTools.sInstance = new IpcTools()
    }

    return IpcTools.sInstance
  }

  init(windows): void {
    ipcMain.handle('open-devtools', () =>
      windows.mainWindow?.webContents?.isDevToolsOpened()
        ? windows.mainWindow?.webContents?.closeDevTools()
        : windows.mainWindow?.webContents?.openDevTools({ mode: 'bottom' })
    )

    ipcMain.handle('get-app-resource', async () => {
      const cpuInfo = process.getCPUUsage()
      const cpuRate = Math.max(0, Math.min(MAX_CPU_VALUE, cpuInfo.percentCPUUsage)).toFixed(
        CPU_FLOAT_FIXED_SIZE
      )
      const memoryInfo = await process.getProcessMemoryInfo()
      const usedMemory = memoryInfo.residentSet
      const totalMemGB = os.totalmem()
      const memRate = ((usedMemory / (totalMemGB / BYTE_VALUE_SIZE)) * FLOAT_TO_PERCENT).toFixed(
        MEM_FLOAT_FIXED_SIZE
      )
      return {
        cpu: cpuRate,
        memory: (usedMemory / BYTE_VALUE_SIZE).toFixed(MEM_FLOAT_FIXED_SIZE),
        memRate: memRate
      }
    })

    ipcMain.handle('open-external-url', async (_, url) => await shell.openExternal(url))
    ipcMain.handle('open-app-dir', async () => await shell.openExternal(this.getAppExecutableDir()))

    logger.info(`init IpcTools done`)
  }

  getAppExecutableDir(): string {
    let exePath = app.getPath('exe')
    if (process.platform === 'darwin') {
      exePath = path.resolve(exePath, '../../..')
    }

    const exeDir = path.dirname(exePath)
    if (!fs.existsSync(exeDir)) {
      logger.error(`not find exe dir: ${exeDir}`)
    }

    return exeDir
  }
}
