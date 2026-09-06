import { describe, expect, it } from 'vitest'
import { useWorkbenchTabs } from '../../src/renderer/src/foundation/workbench/useWorkbenchTabs'

interface FakeTab {
  id: string
  name?: string
}

const makeTab = (id: string, name: string = id): FakeTab => ({ id, name })

type TabManager = ReturnType<typeof useWorkbenchTabs<FakeTab>>

const idsOf = (wb: TabManager): string[] => wb.tabs.value.map((t) => t.id)

function setup(ids: string[], pinned: string[] = []): TabManager {
  const wb = useWorkbenchTabs<FakeTab>()
  ids.forEach((id) => wb.addTab(makeTab(id)))
  pinned.forEach((id) => wb.pinnedTabs.add(id))
  return wb
}

/** 伪造一个最小 MouseEvent */
const fakeEvent = (target: unknown = {}): MouseEvent =>
  ({
    preventDefault: () => {},
    stopPropagation: () => {},
    clientX: 10,
    clientY: 20,
    target
  }) as unknown as MouseEvent

describe('useWorkbenchTabs', () => {
  it('addTab 追加 tab 并激活', () => {
    const wb = useWorkbenchTabs<FakeTab>()
    wb.addTab(makeTab('a'))
    wb.addTab(makeTab('b'))
    expect(idsOf(wb)).toEqual(['a', 'b'])
    expect(wb.activeTabId.value).toBe('b')
  })

  it('activate 接受 string 与 number', () => {
    const wb = setup(['a', 'b'])
    wb.activate(1)
    expect(wb.activeTabId.value).toBe('1')
    wb.activate('a')
    expect(wb.activeTabId.value).toBe('a')
  })

  it('removeTab 移除 tab 并清除固定标记', () => {
    const wb = setup(['a', 'b', 'c'], ['a'])
    wb.removeTab('a')
    expect(idsOf(wb)).toEqual(['b', 'c'])
    expect(wb.pinnedTabs.has('a')).toBe(false)
  })

  it('移除激活 tab 时回退到最后剩余 tab', () => {
    const wb = setup(['a', 'b'])
    wb.activate('a')
    wb.removeTab('a')
    expect(wb.activeTabId.value).toBe('b')
  })

  it('togglePin 无固定时把该 tab 置顶', () => {
    const wb = setup(['a', 'b', 'c'])
    expect(wb.togglePin('c')).toBe(true)
    expect(idsOf(wb)).toEqual(['c', 'a', 'b'])
    expect(wb.pinnedTabs.has('c')).toBe(true)
  })

  it('togglePin 固定到已有固定区之后', () => {
    const wb = setup(['a', 'b', 'c'], ['a'])
    wb.togglePin('c')
    expect(idsOf(wb)).toEqual(['a', 'c', 'b'])
    expect(wb.pinnedTabs.has('c')).toBe(true)
  })

  it('togglePin 取消固定时移动到最后固定位', () => {
    const wb = setup(['a', 'b', 'c'], ['a', 'c'])
    wb.togglePin('a')
    expect(idsOf(wb)).toEqual(['b', 'c', 'a'])
    expect(wb.pinnedTabs.has('a')).toBe(false)
  })

  it('togglePin 未知 id 返回 false', () => {
    const wb = setup(['a'])
    expect(wb.togglePin('zz')).toBe(false)
  })

  it('reorderTabs before 插入到目标之前', () => {
    const wb = setup(['a', 'b', 'c'])
    wb.reorderTabs('c', 'a', 'before')
    expect(idsOf(wb)).toEqual(['c', 'a', 'b'])
  })

  it('reorderTabs after 插入到目标之后并跨固定区固定', () => {
    const wb = setup(['a', 'b', 'c', 'd'], ['b'])
    wb.reorderTabs('c', 'a', 'after', true)
    expect(wb.pinnedTabs.has('c')).toBe(true)
    expect(idsOf(wb)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('reorderTabs target 丢失时恢复原顺序', () => {
    const wb = setup(['a', 'b', 'c'])
    wb.reorderTabs('a', 'not-exists', 'after')
    expect(idsOf(wb)).toEqual(['a', 'b', 'c'])
  })

  it('moveTabToFirst 移动未固定 tab 到未固定区首位并关闭菜单', () => {
    const wb = setup(['a', 'b', 'c'])
    wb.openTabContextMenu(fakeEvent(), makeTab('c'))
    wb.moveTabToFirst()
    expect(idsOf(wb)).toEqual(['c', 'a', 'b'])
    expect(wb.showTabMenu.value).toBe(false)
  })

  it('moveTabToFirst 有固定区时移动未固定 tab 到未固定区首位', () => {
    const wb = setup(['a', 'b', 'c'], ['a'])
    wb.openTabContextMenu(fakeEvent(), makeTab('c'))
    wb.moveTabToFirst()
    expect(idsOf(wb)).toEqual(['a', 'c', 'b'])
    expect(wb.showTabMenu.value).toBe(false)
  })

  it('moveTabToLast 移动固定 tab 到固定区末尾', () => {
    const wb = setup(['a', 'b', 'c'], ['a', 'b'])
    wb.openTabContextMenu(fakeEvent(), makeTab('a'))
    wb.moveTabToLast()
    expect(idsOf(wb)).toEqual(['b', 'a', 'c'])
    expect(wb.showTabMenu.value).toBe(false)
  })

  it('openNavTabContextMenu 通过 closest/.tab-item 定位 tab', () => {
    const wb = setup(['a', 'b'])
    const tabEl = { getAttribute: (attr: string) => (attr === 'data-tab-id' ? 'b' : null) }
    const target = { closest: (selector: string) => (selector === '.tab-item' ? tabEl : null) }
    wb.openNavTabContextMenu(fakeEvent(target))
    expect(wb.rightClickedTab.value?.id).toBe('b')
    expect(wb.showTabMenu.value).toBe(true)
  })

  it('openNavTabContextMenu 点击空白处关闭已开菜单', () => {
    const wb = setup(['a', 'b'])
    wb.openTabContextMenu(fakeEvent(), makeTab('a'))
    const target = { closest: () => null }
    wb.openNavTabContextMenu(fakeEvent(target))
    expect(wb.showTabMenu.value).toBe(false)
  })

  it('hideTabMenu 清空右键目标', () => {
    const wb = setup(['a'])
    wb.openTabContextMenu(fakeEvent(), makeTab('a'))
    wb.hideTabMenu()
    expect(wb.showTabMenu.value).toBe(false)
    expect(wb.rightClickedTab.value).toBeNull()
  })

  it('togglePinContext 固定右键 tab 后关闭菜单', () => {
    const wb = setup(['a', 'b'])
    wb.openTabContextMenu(fakeEvent(), makeTab('b'))
    wb.togglePinContext()
    expect(wb.pinnedTabs.has('b')).toBe(true)
    expect(wb.showTabMenu.value).toBe(false)
  })
})
