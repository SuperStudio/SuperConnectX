import os from 'os'
import { shell, ipcMain, app } from 'electron'
import logger from './IpcAppLogger'
import fs from 'fs'
import path from 'path'

const CPU_FLOAT_FIXED_SIZE = 2
const MEM_FLOAT_FIXED_SIZE = 2
const BYTE_VALUE_SIZE = 1024
const FLOAT_TO_PERCENT = 100

// 缓存上一次的 CPU 时间，用于计算差值
let prevCpuTimes: { idle: number; total: number }[] | null = null

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
      // 系统总 CPU 占用率（通过两次采样差值计算，和任务管理器一致）
      const cpus = os.cpus()
      const curCpuTimes = cpus.map((cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
        return { idle: cpu.times.idle, total }
      })

      let cpuRate = '0.00'
      if (prevCpuTimes && prevCpuTimes.length === curCpuTimes.length) {
        const cachedTimes = prevCpuTimes
        const totalDelta = curCpuTimes.reduce((sum, cur, i) => {
          const prev = cachedTimes[i]
          const idleDelta = cur.idle - prev.idle
          const totalDelta = cur.total - prev.total
          return sum + (totalDelta > 0 ? ((totalDelta - idleDelta) / totalDelta) * 100 : 0)
        }, 0)
        cpuRate = (totalDelta / cpus.length).toFixed(CPU_FLOAT_FIXED_SIZE)
      }
      prevCpuTimes = curCpuTimes

      // 系统总内存占用率
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const usedMem = totalMem - freeMem
      const memRate = ((usedMem / totalMem) * FLOAT_TO_PERCENT).toFixed(MEM_FLOAT_FIXED_SIZE)

      return {
        cpu: cpuRate,
        memory: (usedMem / BYTE_VALUE_SIZE / BYTE_VALUE_SIZE / BYTE_VALUE_SIZE).toFixed(MEM_FLOAT_FIXED_SIZE),
        memRate: memRate
      }
    })

    ipcMain.handle('open-external-url', async (_, url) => await shell.openExternal(url))
    ipcMain.handle('open-app-dir', async () => await shell.openExternal(this.getAppExecutableDir()))

    ipcMain.handle('write-file', async (_, { path: filePath, content }) => {
      try {
        fs.writeFileSync(filePath, content, 'utf-8')
        return { success: true }
      } catch (error) {
        const err = error as Error
        logger.error(`write-file failed: ${err.message}`)
        return { success: false, message: err.message }
      }
    })

    ipcMain.handle('read-file', async (_, { path: filePath }) => {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        return { success: true, content }
      } catch (error) {
        const err = error as Error
        logger.error(`read-file failed: ${err.message}`)
        return { success: false, message: err.message }
      }
    })

    ipcMain.handle('show-item-in-folder', async (_, filePath) => {
      shell.showItemInFolder(filePath)
    })

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
