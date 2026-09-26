/**
 * Cross-app window-control plumbing shared by main, preload and renderer.
 *
 * The package stays Electron-free: ipc / window objects are injected by the
 * app (structural typing), so it works unchanged in unit tests with fakes.
 */
export const WINDOW_IPC_CHANNELS = {
  minimize: 'window:minimize',
  close: 'window:close',
  toggleMaximize: 'window:toggle-maximize',
  getMaximized: 'window:get-maximized',
  maximizedChanged: 'window:maximized-changed'
} as const

/**
 * The bridge surface preload exposes to the renderer for window controls.
 * Built with createWindowControlApi() in each app's preload, typed in the
 * app's d.ts, consumed via @superx/foundation's useWindowControls.
 */
export interface WindowControlApi {
  minimize(): void
  close(): void
  toggleMaximize(): void
  getMaximized(): Promise<boolean> | boolean
  /** Subscribes to maximize-state pushes from main; returns an unsubscribe fn. */
  onMaximizedChanged(callback: (maximized: boolean) => void): () => void
}

/** Structural slice of IpcRenderer needed by the preload bridge. */
export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void
}

/** Preload-side factory: one call replaces the whole hand-written bridge. */
export function createWindowControlApi(ipc: IpcRendererLike): WindowControlApi {
  return {
    minimize: (): void => {
      void ipc.invoke(WINDOW_IPC_CHANNELS.minimize)
    },
    close: (): void => {
      void ipc.invoke(WINDOW_IPC_CHANNELS.close)
    },
    toggleMaximize: (): void => {
      void ipc.invoke(WINDOW_IPC_CHANNELS.toggleMaximize)
    },
    getMaximized: (): Promise<boolean> =>
      ipc.invoke(WINDOW_IPC_CHANNELS.getMaximized).then((value) => value === true),
    onMaximizedChanged: (callback: (maximized: boolean) => void): (() => void) => {
      const listener = (_event: unknown, maximized: unknown): void => callback(maximized === true)
      ipc.on(WINDOW_IPC_CHANNELS.maximizedChanged, listener)
      return () => ipc.removeListener(WINDOW_IPC_CHANNELS.maximizedChanged, listener)
    }
  }
}

/** Structural slice of BrowserWindow the main-side handlers need. */
export interface WindowControlTarget {
  minimize(): void
  close(): void
  maximize(): void
  unmaximize(): void
  isMaximized(): boolean
  on(eventName: 'maximize' | 'unmaximize', listener: () => void): unknown
  webContents: { send(channel: string, ...args: unknown[]): void }
}

/** Structural slice of IpcMain needed to register handlers. */
export interface IpcHandlerRegistrar {
  handle(channel: string, handler: (...args: unknown[]) => unknown): void
}

export interface WindowControlHandlers {
  /** Attach maximize-state broadcasting to the app's main window. */
  bind(window: WindowControlTarget): void
}

/**
 * Main-side factory: registers all window-control IPC handlers.
 * App-specific close policy (e.g. minimize-to-tray) can be layered on top by
 * intercepting the 'window:close' channel or wrapping the returned handlers.
 */
export function registerWindowControlHandlers(options: {
  ipc: IpcHandlerRegistrar
  getWindow: () => WindowControlTarget | null | undefined
}): WindowControlHandlers {
  const { ipc, getWindow } = options

  const broadcast = (): void => {
    const window = getWindow()
    if (window) {
      window.webContents.send(WINDOW_IPC_CHANNELS.maximizedChanged, window.isMaximized())
    }
  }

  ipc.handle(WINDOW_IPC_CHANNELS.minimize, () => getWindow()?.minimize())
  ipc.handle(WINDOW_IPC_CHANNELS.close, () => getWindow()?.close())
  ipc.handle(WINDOW_IPC_CHANNELS.getMaximized, () => getWindow()?.isMaximized() ?? false)
  ipc.handle(WINDOW_IPC_CHANNELS.toggleMaximize, () => {
    const window = getWindow()
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })

  return {
    bind: (window) => {
      window.on('maximize', broadcast)
      window.on('unmaximize', broadcast)
    }
  }
}
