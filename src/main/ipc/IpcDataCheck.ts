import { ipcMain } from 'electron'
import { getPlugins, checkData, PluginInfo, CheckDataResult } from '../utils/DataCheckEngine'
import logger from './IpcAppLogger'

/**
 * 数据校验 IPC 模块 (纯 TypeScript 实现，无外部依赖)
 */
class IpcDataCheck {
  private static instance: IpcDataCheck

  static getInstance(): IpcDataCheck {
    if (!IpcDataCheck.instance) {
      IpcDataCheck.instance = new IpcDataCheck()
    }
    return IpcDataCheck.instance
  }

  init(): void {
    logger.info('[IpcDataCheck] 初始化数据校验模块 (JS引擎)')

    // 获取所有可用校验算法
    ipcMain.handle('datacheck:getPlugins', async (): Promise<PluginInfo[]> => {
      return getPlugins()
    })

    // 执行数据校验
    ipcMain.handle(
      'datacheck:checkData',
      async (_event, pluginName: string, hexData: string): Promise<CheckDataResult> => {
        try {
          return checkData(pluginName, hexData)
        } catch (err: any) {
          logger.error(`[IpcDataCheck] checkData failed: ${err.message}`)
          throw err
        }
      }
    )
  }
}

export default IpcDataCheck
