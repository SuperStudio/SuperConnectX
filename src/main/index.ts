import { BrowserWindow, ipcMain } from 'electron'
import ProtocolLogger from './utils/ProtocolLogger'
import IpcStorage from './ipc/IpcStorage'
import IpcTelnet from './ipc/IpcTelnet'
import IpcWindow from './ipc/IpcWindow'
import IpcTools from './ipc/IpcTools'
import IpcMain from './ipc/IpcMain'
import logger from './ipc/IpcAppLogger'

const protocolLogger = new ProtocolLogger()
const windows = { mainWindow: undefined as BrowserWindow | undefined }

logger.info(`======== start superconnect-x ========`)
logger.info(JSON.stringify(IpcMain.getInstance().getVersionInfo()))
IpcStorage.getInstance().init()
IpcTelnet.getInstance().init(protocolLogger, windows)
IpcWindow.getInstance().init(windows)
IpcTools.getInstance().init(windows)
IpcMain.getInstance().init(protocolLogger, windows)
logger.info(`======== start superconnect-x ok ========`)
