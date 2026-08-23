/**
 * Compatibility export for SuperConnectX callers.
 * New workbench code should import from `foundation/workbench/useSplitWorkspace`.
 */
import { useSplitWorkspace } from '../../foundation/workbench/useSplitWorkspace'

export type { Panel, SplitState } from '../../foundation/workbench/useSplitWorkspace'

export function useSplitPanel(_defaultTabId: string) {
  return useSplitWorkspace()
}
