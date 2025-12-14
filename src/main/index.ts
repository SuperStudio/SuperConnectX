import { BrowserWindow } from 'electron'
import logger from './utils/logger'
import IpcStorage from './ipc/IpcStorage'
import IpcTelnet from './ipc/IpcTelnet'
import IpcWindow from './ipc/IpcWindow'
import IpcTools from './ipc/IpcTools'
import IpcMain from './ipc/IpcMain'

const _logger = new logger()
const windows = { mainWindow: undefined as BrowserWindow | undefined }

IpcStorage.getInstance().init()
IpcTelnet.getInstance().init(_logger, windows)
IpcWindow.getInstance().init(windows)
IpcTools.getInstance().init(windows)
IpcMain.getInstance().init(_logger, windows)
