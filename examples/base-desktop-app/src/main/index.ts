import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { COUNTER_CHANNEL, type CounterPayload } from '../shared/ipc/counter'

/**
 * Module-level state — a single counter persisted in memory for the demo.
 * A real application would persist this to disk (or a settings store).
 */
let counterValue = 0

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    title: 'Base Desktop App',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerCounterIpc(): void {
  ipcMain.handle(COUNTER_CHANNEL.GET, (): CounterPayload => ({ value: counterValue }))

  ipcMain.handle(COUNTER_CHANNEL.INCREMENT, (_event, payload: CounterPayload): CounterPayload => {
    // NOTE: At this point `payload` is already plain JSON, because the renderer
    // wrapped it with JSON.parse(JSON.stringify(...)) before sending it across
    // the contextBridge boundary. See the contract documented in preload/index.ts
    // and features/counter/useCounter.ts.
    counterValue = payload.value
    return { value: counterValue }
  })

  ipcMain.handle(COUNTER_CHANNEL.RESET, (): CounterPayload => {
    counterValue = 0
    return { value: counterValue }
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.superstudio.base-desktop-app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerCounterIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
