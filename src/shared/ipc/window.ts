/** Stable preload-to-main IPC channel names for generic window controls. */
export const WINDOW_IPC_CHANNELS = {
  minimize: 'minimize-window',
  close: 'close-window',
  getMaximized: 'get-window-state',
  toggleMaximize: 'maximize-window',
  getAppVersion: 'get-app-version',
  toggleFullscreen: 'toggle-fullscreen-window'
} as const

export type WindowIpcChannel = (typeof WINDOW_IPC_CHANNELS)[keyof typeof WINDOW_IPC_CHANNELS]
