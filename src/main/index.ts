import { BrowserWindow, app } from 'electron'
import ProtocolLogger from './utils/ProtocolLogger'
import IpcStorage from './ipc/IpcStorage'
import IpcConnector from './ipc/IpcConnector'
import IpcWindow from './ipc/IpcWindow'
import IpcTools from './ipc/IpcTools'
import IpcSerialPort from './ipc/IpcSerialPort'
import IpcMain from './ipc/IpcMain'
import IpcDataCheck from './ipc/IpcDataCheck'
import AppUpdater from './updater/AppUpdater'
import logger from './ipc/IpcAppLogger'
import { migrateDataIfNeeded, initAppPaths } from './utils/AppDir'

// 必须在 app.whenReady() 之前调用，将 Electron 内置路径（Cache、CrashDumps 等）
// 重定向到 userData 子目录，避免根目录散乱
initAppPaths()

const protocolLogger = new ProtocolLogger()
const windows = { mainWindow: undefined as BrowserWindow | undefined }

logger.info(`======== start superconnect-x ========`)
logger.info(JSON.stringify(IpcMain.getInstance().getVersionInfo()))

// 迁移旧数据：如果 EXE 目录下存在旧的 userdata/backup，拷贝到 appDataDir 并删除旧目录
migrateDataIfNeeded(logger)

IpcStorage.getInstance().init()
IpcConnector.getInstance().init(protocolLogger, windows)
IpcWindow.getInstance().init(windows)
IpcTools.getInstance().init(windows)
IpcSerialPort.getInstance().init(protocolLogger, windows)
IpcMain.getInstance().init(protocolLogger, windows)
IpcDataCheck.getInstance().init()

// 初始化自动更新（窗口创建后）
if (!app.isPackaged || process.env.NODE_ENV !== 'development') {
  app.whenReady().then(() => {
    if (windows.mainWindow) {
      AppUpdater.getInstance().init(windows.mainWindow)
      logger.info('[Updater] Auto-updater module initialized')
    }
  })
}

logger.info(`======== start superconnect-x ok ========`)
