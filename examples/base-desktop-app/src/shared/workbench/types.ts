export const WORKBENCH_TAB_DRAG_MIME = 'application/x-workbench-tab-id'
export const WORKBENCH_TAB_SOURCE_PANEL_MIME = 'application/x-workbench-tab-source-panel-id'

export interface WorkbenchTab {
  id: string
  title: string
  pinned?: boolean
  /** Opaque payload describing how to render the tab content. Host-owned. */
  payload?: unknown
}

export interface WorkbenchPanel {
  id: string
  activeTabId: string
  tabIds: string[]
}

export interface WorkbenchSplitState {
  panels: WorkbenchPanel[]
  direction: 'horizontal' | 'vertical'
  splitRatio: number
  isSplitting: boolean
}
