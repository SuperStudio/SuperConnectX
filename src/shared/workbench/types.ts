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
