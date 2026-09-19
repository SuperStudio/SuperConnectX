/**
 * @deprecated Compatibility export for SuperConnectX callers.
 * Session-restore logic now lives in `features/tabs/useSessionRestore`.
 */
export {
  useSessionRestore,
  isSessionRestoreEnabled,
  setSessionRestoreEnabled
} from '../../features/tabs/useSessionRestore'
export type {
  SessionTab,
  SessionPanel,
  SessionState,
  SplitState,
  Panel
} from '../../features/tabs/useSessionRestore'
