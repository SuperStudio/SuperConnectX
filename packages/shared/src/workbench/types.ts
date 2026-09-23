/** Generic tab workspace panel. Tab IDs are application-owned opaque strings. */
export interface WorkbenchPanel {
  id: string
  activeTabId: string
  tabIds: string[]
}

/** Generic multi-panel workspace layout independent of tab content. */
export interface WorkbenchSplitState {
  panels: WorkbenchPanel[]
  direction: 'horizontal' | 'vertical'
  splitRatio: number
  isSplitting: boolean
}

/** The smallest presentation model required by a reusable workbench tab. */
export interface WorkbenchTab {
  /** Opaque identifier owned by the host application. */
  id: string
  /** Text displayed by a host tab renderer. */
  title: string
  /** Whether the host should keep the tab visible as pinned. */
  pinned?: boolean
}

/** HTML drag data type shared by workbench tab bars and split containers. */
export const WORKBENCH_TAB_DRAG_MIME = 'application/x-workbench-tab'
export const WORKBENCH_TAB_SOURCE_PANEL_MIME = 'application/x-workbench-source-panel'
