/**
 * useSplitWorkspace - 分屏工作区状态管理测试（foundation/workbench）
 * 测试：面板拆分、合并、tab 管理、比例调整
 */
import { describe, it, expect } from 'vitest'
import { useSplitWorkspace } from '../src/workbench/useSplitWorkspace'

describe('splitPanel', () => {
  it('should create a new panel next to the reference panel', () => {
    const { splitState, splitPanel } = useSplitWorkspace()
    splitPanel('panel-0', 'horizontal')
    expect(splitState.panels).toHaveLength(2)
    expect(splitState.panels[0].id).toBe('panel-0')
    expect(splitState.panels[1].id).toContain('panel-')
  })

  it('should set direction to the specified direction', () => {
    const { splitState, splitPanel } = useSplitWorkspace()
    splitPanel('panel-0', 'vertical')
    expect(splitState.direction).toBe('vertical')
  })

  it('should set split ratio to 0.5', () => {
    const { splitState, splitPanel } = useSplitWorkspace()
    splitPanel('panel-0')
    expect(splitState.splitRatio).toBe(0.5)
  })

  it('should not create panel for non-existent panelId', () => {
    const { splitState, splitPanel } = useSplitWorkspace()
    splitPanel('nonexistent')
    expect(splitState.panels).toHaveLength(1)
  })

  it('should insert new panel after the reference', () => {
    const { splitState, splitPanel } = useSplitWorkspace()
    splitState.panels[0].tabIds = ['tab-1']
    splitPanel('panel-0')
    // new panel should be at index 1
    expect(splitState.panels[1].tabIds).toEqual([])
    expect(splitState.panels[0].tabIds).toEqual(['tab-1'])
  })
})

describe('removePanel', () => {
  it('should not remove the last panel', () => {
    const { splitState, removePanel } = useSplitWorkspace()
    removePanel('panel-0')
    expect(splitState.panels).toHaveLength(1)
  })

  it('should remove a panel and merge tabs', () => {
    const { splitState, splitPanel, removePanel } = useSplitWorkspace()
    splitState.panels[0].tabIds = ['tab-1']
    splitPanel('panel-0')
    const newPanelId = splitState.panels[1].id
    splitState.panels[1].tabIds = ['tab-2', 'tab-3']
    splitState.panels[1].activeTabId = 'tab-2'

    removePanel(newPanelId)
    expect(splitState.panels).toHaveLength(1)
    // tabs should be merged
    expect(splitState.panels[0].tabIds).toContain('tab-1')
    expect(splitState.panels[0].tabIds).toContain('tab-2')
    expect(splitState.panels[0].tabIds).toContain('tab-3')
  })

  it('should set splitRatio to 1 when only one panel remains', () => {
    const { splitState, splitPanel, removePanel } = useSplitWorkspace()
    splitPanel('panel-0')
    const newPanelId = splitState.panels[1].id
    removePanel(newPanelId)
    expect(splitState.splitRatio).toBe(1)
  })

  it('should not merge duplicate tabs', () => {
    const { splitState, splitPanel, removePanel } = useSplitWorkspace()
    splitState.panels[0].tabIds = ['tab-1']
    splitPanel('panel-0')
    const newPanelId = splitState.panels[1].id
    splitState.panels[1].tabIds = ['tab-1', 'tab-2'] // 'tab-1' is duplicate
    removePanel(newPanelId)
    // tab-1 should not appear twice
    const tabCount = splitState.panels[0].tabIds.filter((id) => id === 'tab-1').length
    expect(tabCount).toBe(1)
  })
})

describe('switchPanelTab', () => {
  it('should update activeTabId for the panel', () => {
    const { splitState, switchPanelTab } = useSplitWorkspace()
    switchPanelTab('panel-0', 'tab-5')
    expect(splitState.panels[0].activeTabId).toBe('tab-5')
  })

  it('should not throw for non-existent panel', () => {
    const { switchPanelTab } = useSplitWorkspace()
    expect(() => switchPanelTab('nonexistent', 'tab-1')).not.toThrow()
  })
})

describe('updateSplitRatio', () => {
  it('should update ratio within bounds', () => {
    const { splitState, updateSplitRatio } = useSplitWorkspace()
    updateSplitRatio(0.5)
    expect(splitState.splitRatio).toBe(0.5)
  })

  it('should clamp to minimum 0.1', () => {
    const { splitState, updateSplitRatio } = useSplitWorkspace()
    updateSplitRatio(0.0)
    expect(splitState.splitRatio).toBe(0.1)
  })

  it('should clamp to maximum 0.9', () => {
    const { splitState, updateSplitRatio } = useSplitWorkspace()
    updateSplitRatio(1.0)
    expect(splitState.splitRatio).toBe(0.9)
  })

  it('should clamp negative values', () => {
    const { splitState, updateSplitRatio } = useSplitWorkspace()
    updateSplitRatio(-0.5)
    expect(splitState.splitRatio).toBe(0.1)
  })
})

describe('onTabClosed', () => {
  it('should remove tab from all panels', () => {
    const { splitState, onTabClosed } = useSplitWorkspace()
    splitState.panels[0].tabIds = ['tab-1', 'tab-2', 'tab-3']
    splitState.panels[0].activeTabId = 'tab-2'
    onTabClosed('tab-2')
    expect(splitState.panels[0].tabIds).not.toContain('tab-2')
    expect(splitState.panels[0].tabIds).toEqual(['tab-1', 'tab-3'])
  })

  it('should update activeTabId when closed tab was active', () => {
    const { splitState, onTabClosed } = useSplitWorkspace()
    splitState.panels[0].tabIds = ['tab-1', 'tab-2']
    splitState.panels[0].activeTabId = 'tab-1'
    onTabClosed('tab-1')
    expect(splitState.panels[0].activeTabId).toBe('tab-2')
  })

  it('should set activeTabId to empty when no tabs left', () => {
    const { splitState, onTabClosed } = useSplitWorkspace()
    splitState.panels[0].tabIds = ['tab-1']
    splitState.panels[0].activeTabId = 'tab-1'
    onTabClosed('tab-1')
    expect(splitState.panels[0].activeTabId).toBe('')
  })

  it('should remove empty panels (except the last one)', () => {
    const { splitState, splitPanel, onTabClosed } = useSplitWorkspace()
    splitState.panels[0].tabIds = ['tab-1']
    splitPanel('panel-0')
    splitState.panels[1].tabIds = ['tab-2']
    // Close tab-2 (the only tab in panel 2)
    onTabClosed('tab-2')
    // panel 2 should be removed
    expect(splitState.panels).toHaveLength(1)
    expect(splitState.panels[0].id).toBe('panel-0')
  })

  it('should not remove the last panel even if empty', () => {
    const { splitState, onTabClosed } = useSplitWorkspace()
    splitState.panels[0].tabIds = ['tab-1']
    onTabClosed('tab-1')
    // last panel should remain even if empty
    expect(splitState.panels).toHaveLength(1)
  })
})
