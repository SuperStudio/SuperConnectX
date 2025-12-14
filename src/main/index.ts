import { BrowserWindow } from 'electron'
import ProtocolLogger from './utils/ProtocolLogger'
import IpcStorage from './ipc/IpcStorage'
import IpcTelnet from './ipc/IpcTelnet'
import IpcWindow from './ipc/IpcWindow'
import IpcTools from './ipc/IpcTools'
import IpcMain from './ipc/IpcMain'

const protocolLogger = new ProtocolLogger()
const windows = { mainWindow: undefined as BrowserWindow | undefined }

IpcStorage.getInstance().init()
IpcTelnet.getInstance().init(protocolLogger, windows)
IpcWindow.getInstance().init(windows)
IpcTools.getInstance().init(windows)
IpcMain.getInstance().init(protocolLogger, windows)
