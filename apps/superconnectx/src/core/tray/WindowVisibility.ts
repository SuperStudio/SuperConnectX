export interface VisibilityWindow {
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
  hide(): void
}

/** Restores a minimized window when needed, then brings it to the foreground. */
export function showAndFocusWindow(window: VisibilityWindow): void {
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

/** Hides a window without closing its Electron process. */
export function hideWindow(window: VisibilityWindow): void {
  window.hide()
}
