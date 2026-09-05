/**
 * @deprecated Terminal display labels now belong to `features/terminal`.
 * Legacy names are retained for callers that still import this app-level module.
 */
export {
  sendDisplayText,
  recvDisplayText,
  updateSendDisplayText,
  updateRecvDisplayText,
  loadTerminalDisplayText as loadSendDisplayText,
  initTerminalDisplayTextListener as initSendDisplayTextListener
} from '../../features/terminal/useTerminalDisplayText'
