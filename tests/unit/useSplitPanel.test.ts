/**
 * useSplitPanel - 分屏状态管理纯逻辑测试
 * 测试：面板拆分、合并、tab管理、比例调整
 */
import { describe, it, expect } from 'vitest'

interface Panel {
  id: string
  activeTabId: string
  tabIds: string[]
}

interface SplitState {
  panels: Panel[]
  direction: 'horizontal' | 'vertical'
  splitRatio: number
  isSplitting: boolean
}

function splitPanel(state: SplitState, panelId: string, direction: 'horizontal' | 'vertical' = 'horizontal'): void {
  const idx = state.panels.findIndex(p => p.id === panelId)
  if (idx === -1) return
  const newPanel: Panel = {
    id: `panel-${Date.now()}`,
    activeTabId: '',
    tabIds: []
  }
  state.direction = direction
  state.panels.splice(idx + 1, 0, newPanel)
  state.splitRatio = 0.5
}

function removePanel(state: SplitState, panelId: string): void {
  if (state.panels.length <= 1) return
  const idx = state.panels.findIndex(p => p.id === panelId)
  if (idx === -1) return
  const removedPanel = state.panels[idx]
  if (removedPanel.tabIds.length > 0 && state.panels.length > 1) {
    const targetPanel = idx === 0 ? state.panels[1] : state.panels[0]
    for (const tabId of removedPanel.tabIds) {
      if (!targetPanel.tabIds.includes(tabId)) {
        targetPanel.tabIds.push(tabId)
      }
    }
  }
  state.panels.splice(idx, 1)
  if (state.panels.length === 1) {
    state.splitRatio = 1
  }
}

function switchPanelTab(state: SplitState, panelId: string, tabId: string): void {
  const panel = state.panels.find(p => p.id === panelId)
  if (panel) {
    panel.activeTabId = tabId
  }
}

function updateSplitRatio(state: SplitState, ratio: number): void {
  state.splitRatio = Math.max(0.1, Math.min(0.9, ratio))
}

function onTabClosed(state: SplitState, tabId: string): void {
  for (const panel of state.panels) {
    const idx = panel.tabIds.indexOf(tabId)
    if (idx >= 0) {
      panel.tabIds.splice(idx, 1)
    }
    if (panel.activeTabId === tabId) {
      panel.activeTabId = panel.tabIds.length > 0 ? panel.tabIds[0] : ''
    }
  }
  for (let i = state.panels.length - 1; i >= 0; i--) {
    if (state.panels[i].tabIds.length === 0 && state.panels.length > 1) {
      state.panels.splice(i, 1)
    }
  }
  if (state.panels.length === 1) {
    state.splitRatio = 1
  }
}

function createDefaultState(): SplitState {
  return {
    panels: [{ id: 'panel-0', activeTabId: '', tabIds: [] }],
    direction: 'horizontal',
    splitRatio: 1,
    isSplitting: false
  }
}

describe('splitPanel', () => {
  it('should create a new panel next to the reference panel', () => {
    const state = createDefaultState()
    splitPanel(state, 'panel-0', 'horizontal')
    expect(state.panels).toHaveLength(2)
    expect(state.panels[0].id).toBe('panel-0')
    expect(state.panels[1].id).toContain('panel-')
  })

  it('should set direction to the specified direction', () => {
    const state = createDefaultState()
    splitPanel(state, 'panel-0', 'vertical')
    expect(state.direction).toBe('vertical')
  })

  it('should set split ratio to 0.5', () => {
    const state = createDefaultState()
    splitPanel(state, 'panel-0')
    expect(state.splitRatio).toBe(0.5)
  })

  it('should not create panel for non-existent panelId', () => {
    const state = createDefaultState()
    splitPanel(state, 'nonexistent')
    expect(state.panels).toHaveLength(1)
  })

  it('should insert new panel after the reference', () => {
    const state = createDefaultState()
    state.panels[0].tabIds = ['tab-1']
    splitPanel(state, 'panel-0')
    // new panel should be at index 1
    expect(state.panels[1].tabIds).toEqual([])
    expect(state.panels[0].tabIds).toEqual(['tab-1'])
  })
})

describe('removePanel', () => {
  it('should not remove the last panel', () => {
    const state = createDefaultState()
    removePanel(state, 'panel-0')
    expect(state.panels).toHaveLength(1)
  })

  it('should remove a panel and merge tabs', () => {
    const state = createDefaultState()
    state.panels[0].tabIds = ['tab-1']
    splitPanel(state, 'panel-0')
    const newPanelId = state.panels[1].id
    state.panels[1].tabIds = ['tab-2', 'tab-3']
    state.panels[1].activeTabId = 'tab-2'

    removePanel(state, newPanelId)
    expect(state.panels).toHaveLength(1)
    // tabs should be merged
    expect(state.panels[0].tabIds).toContain('tab-1')
    expect(state.panels[0].tabIds).toContain('tab-2')
    expect(state.panels[0].tabIds).toContain('tab-3')
  })

  it('should set splitRatio to 1 when only one panel remains', () => {
    const state = createDefaultState()
    splitPanel(state, 'panel-0')
    const newPanelId = state.panels[1].id
    removePanel(state, newPanelId)
    expect(state.splitRatio).toBe(1)
  })

  it('should not merge duplicate tabs', () => {
    const state = createDefaultState()
    state.panels[0].tabIds = ['tab-1']
    splitPanel(state, 'panel-0')
    const newPanelId = state.panels[1].id
    state.panels[1].tabIds = ['tab-1', 'tab-2'] // 'tab-1' is duplicate
    removePanel(state, newPanelId)
    // tab-1 should not appear twice
    const tabCount = state.panels[0].tabIds.filter(id => id === 'tab-1').length
    expect(tabCount).toBe(1)
  })
})

describe('switchPanelTab', () => {
  it('should update activeTabId for the panel', () => {
    const state = createDefaultState()
    switchPanelTab(state, 'panel-0', 'tab-5')
    expect(state.panels[0].activeTabId).toBe('tab-5')
  })

  it('should not throw for non-existent panel', () => {
    const state = createDefaultState()
    expect(() => switchPanelTab(state, 'nonexistent', 'tab-1')).not.toThrow()
  })
})

describe('updateSplitRatio', () => {
  it('should update ratio within bounds', () => {
    const state = createDefaultState()
    updateSplitRatio(state, 0.5)
    expect(state.splitRatio).toBe(0.5)
  })

  it('should clamp to minimum 0.1', () => {
    const state = createDefaultState()
    updateSplitRatio(state, 0.0)
    expect(state.splitRatio).toBe(0.1)
  })

  it('should clamp to maximum 0.9', () => {
    const state = createDefaultState()
    updateSplitRatio(state, 1.0)
    expect(state.splitRatio).toBe(0.9)
  })

  it('should clamp negative values', () => {
    const state = createDefaultState()
    updateSplitRatio(state, -0.5)
    expect(state.splitRatio).toBe(0.1)
  })
})

describe('onTabClosed', () => {
  it('should remove tab from all panels', () => {
    const state = createDefaultState()
    state.panels[0].tabIds = ['tab-1', 'tab-2', 'tab-3']
    state.panels[0].activeTabId = 'tab-2'
    onTabClosed(state, 'tab-2')
    expect(state.panels[0].tabIds).not.toContain('tab-2')
    expect(state.panels[0].tabIds).toEqual(['tab-1', 'tab-3'])
  })

  it('should update activeTabId when closed tab was active', () => {
    const state = createDefaultState()
    state.panels[0].tabIds = ['tab-1', 'tab-2']
    state.panels[0].activeTabId = 'tab-1'
    onTabClosed(state, 'tab-1')
    expect(state.panels[0].activeTabId).toBe('tab-2')
  })

  it('should set activeTabId to empty when no tabs left', () => {
    const state = createDefaultState()
    state.panels[0].tabIds = ['tab-1']
    state.panels[0].activeTabId = 'tab-1'
    onTabClosed(state, 'tab-1')
    expect(state.panels[0].activeTabId).toBe('')
  })

  it('should remove empty panels (except the last one)', () => {
    const state = createDefaultState()
    state.panels[0].tabIds = ['tab-1']
    splitPanel(state, 'panel-0')
    const panel2Id = state.panels[1].id
    state.panels[1].tabIds = ['tab-2']
    // Close tab-2 (the only tab in panel 2)
    onTabClosed(state, 'tab-2')
    // panel 2 should be removed
    expect(state.panels).toHaveLength(1)
    expect(state.panels[0].id).toBe('panel-0')
  })

  it('should not remove the last panel even if empty', () => {
    const state = createDefaultState()
    state.panels[0].tabIds = ['tab-1']
    onTabClosed(state, 'tab-1')
    // last panel should remain even if empty
    expect(state.panels).toHaveLength(1)
  })
})
