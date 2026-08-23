export interface WindowControlTarget {
  minimize(): void
  close(): void
  isMaximized(): boolean
  maximize(): void
  unmaximize(): void
  isFullScreen(): boolean
  setFullScreen(fullscreen: boolean): void
}

export interface IpcHandlerRegistrar {
  handle(channel: string, handler: () => unknown): void
}

export interface WindowControlOptions {
  ipc: IpcHandlerRegistrar
  getWindow: () => WindowControlTarget | null | undefined
  getAppVersion: () => string
  onClose: (window: WindowControlTarget) => void
}

/**
 * Registers reusable window-control IPC handlers.
 * Application-specific close behavior (for example minimize-to-tray) is
 * supplied through `onClose` instead of being coupled to the core service.
 */
export function registerWindowControls(options: WindowControlOptions): void {
  const getWindow = options.getWindow

  options.ipc.handle('minimize-window', () => getWindow()?.minimize())
  options.ipc.handle('close-window', () => {
    const window = getWindow()
    if (window) options.onClose(window)
  })
  options.ipc.handle('get-window-state', () => getWindow()?.isMaximized())
  options.ipc.handle('maximize-window', () => {
    const window = getWindow()
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  options.ipc.handle('get-app-version', () => options.getAppVersion())
  options.ipc.handle('toggle-fullscreen-window', () => {
    const window = getWindow()
    if (window) window.setFullScreen(!window.isFullScreen())
  })
}
