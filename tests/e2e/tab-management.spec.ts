import { test, expect } from '@playwright/test'
import { launchApp, closeApp, invokeStorage } from './helpers'

/**
 * 选项卡管理 E2E 测试：
 *  1. 点击"连接"打开终端选项卡
 *  2. 多个选项卡切换
 *  3. 选项卡右键菜单（关闭/固定）
 *  4. 选项卡关闭按钮
 */
test.describe('选项卡管理', () => {
  test('点击连接按钮可打开终端选项卡', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      // 预置连接
      await invokeStorage(app, 'addConnection', {
        name: 'TAB-连接1',
        connectionType: 'telnet',
        host: '10.0.0.1',
        port: 23
      })
      await page.reload()
      await page.waitForSelector('.app-container', { timeout: 30000 })

      const group = page.locator('.connection-group').filter({ hasText: 'TELNET' }).first()
      await expect(group).toBeVisible()

      // 点击连接按钮，打开选项卡
      const card = group.locator('.connection-card').filter({ hasText: 'TAB-连接1' }).first()
      await card.getByRole('button', { name: '连接' }).click()

      // 选项卡栏出现，包含连接名，且为空状态占位消失
      await expect(page.locator('.tab-item')).toHaveCount(1)
      await expect(page.locator('.tab-item').filter({ hasText: 'TAB-连接1' })).toHaveCount(1)
      await expect(page.locator('.empty-tabs-placeholder')).toHaveCount(0)

      // 终端组件已渲染（UnifiedTerminal 区域）
      await expect(page.locator('.telnet-terminal')).toHaveCount(1)
    } finally {
      await closeApp(app, userDataDir)
    }
  })

  test('多个选项卡可切换激活', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      await invokeStorage(app, 'addConnection', {
        name: 'TAB-AAA',
        connectionType: 'telnet',
        host: '10.0.0.1',
        port: 23
      })
      await invokeStorage(app, 'addConnection', {
        name: 'TAB-BBB',
        connectionType: 'telnet',
        host: '10.0.0.2',
        port: 23
      })
      await page.reload()
      await page.waitForSelector('.app-container', { timeout: 30000 })

      const group = page.locator('.connection-group').filter({ hasText: 'TELNET' }).first()

      // 打开两个连接
      await group
        .locator('.connection-card')
        .filter({ hasText: 'TAB-AAA' })
        .first()
        .getByRole('button', { name: '连接' })
        .click()
      await group
        .locator('.connection-card')
        .filter({ hasText: 'TAB-BBB' })
        .first()
        .getByRole('button', { name: '连接' })
        .click()

      await expect(page.locator('.tab-item')).toHaveCount(2)

      // 最后一个（BBB）默认激活
      await expect(page.locator('.tab-item').filter({ hasText: 'TAB-BBB' }).first()).toHaveClass(
        /active/
      )

      // 点击 AAA 切换
      await page.locator('.tab-item').filter({ hasText: 'TAB-AAA' }).first().click()
      await expect(page.locator('.tab-item').filter({ hasText: 'TAB-AAA' }).first()).toHaveClass(
        /active/
      )
      await expect(
        page.locator('.tab-item').filter({ hasText: 'TAB-BBB' }).first()
      ).not.toHaveClass(/active/)
    } finally {
      await closeApp(app, userDataDir)
    }
  })

  test('可通过右键菜单将标签分屏显示', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      for (const [name, host] of [['TAB-分屏-A', '10.0.2.1'], ['TAB-分屏-B', '10.0.2.2']]) {
        await invokeStorage(app, 'addConnection', {
          name,
          connectionType: 'telnet',
          host,
          port: 23
        })
      }
      await page.reload()
      await page.waitForSelector('.app-container', { timeout: 30000 })

      const group = page.locator('.connection-group').filter({ hasText: 'TELNET' }).first()
      for (const name of ['TAB-分屏-A', 'TAB-分屏-B']) {
        await group
          .locator('.connection-card')
          .filter({ hasText: name })
          .first()
          .getByRole('button', { name: '连接' })
          .click()
      }

      await page.locator('.tab-item').filter({ hasText: 'TAB-分屏-B' }).first().click({ button: 'right' })
      await page.locator('.context-menu .menu-item').filter({ hasText: '分屏显示' }).click()

      await expect(page.locator('.split-resizer')).toBeVisible()
      await expect(page.locator('.panel-inner')).toHaveCount(2)
      await expect(page.locator('.panel-terminal-area .telnet-terminal:visible')).toHaveCount(2)

      const leftPanel = page.locator('.panel-inner').nth(0)
      const rightPanel = page.locator('.panel-inner').nth(1)
      const leftRootBox = await leftPanel.locator('.unified-terminal:visible').boundingBox()
      const rightRootBox = await rightPanel.locator('.unified-terminal:visible').boundingBox()
      const leftSplitter = leftPanel.locator('.vertical-splitter:visible')
      const rightSplitter = rightPanel.locator('.vertical-splitter:visible')
      const leftBefore = await leftSplitter.boundingBox()
      const rightBefore = await rightSplitter.boundingBox()
      expect(leftRootBox).not.toBeNull()
      expect(rightRootBox).not.toBeNull()
      expect(leftBefore).not.toBeNull()
      expect(rightBefore).not.toBeNull()

      await page.mouse.move(leftBefore!.x + leftBefore!.width / 2, leftBefore!.y + 2)
      await page.mouse.down()
      await page.mouse.move(
        leftBefore!.x + leftBefore!.width / 2,
        leftRootBox!.y + leftRootBox!.height * 0.35
      )
      await page.mouse.up()

      const leftAfter = await leftSplitter.boundingBox()
      const rightAfterLeftDrag = await rightSplitter.boundingBox()
      expect(Math.abs(leftAfter!.y - leftBefore!.y)).toBeGreaterThan(10)
      expect(Math.abs(rightAfterLeftDrag!.y - rightBefore!.y)).toBeLessThanOrEqual(1)

      await page.mouse.move(
        rightAfterLeftDrag!.x + rightAfterLeftDrag!.width / 2,
        rightAfterLeftDrag!.y + 2
      )
      await page.mouse.down()
      await page.mouse.move(
        rightAfterLeftDrag!.x + rightAfterLeftDrag!.width / 2,
        rightRootBox!.y + rightRootBox!.height * 0.8
      )
      await page.mouse.up()

      const leftAfterRightDrag = await leftSplitter.boundingBox()
      const rightAfter = await rightSplitter.boundingBox()
      expect(Math.abs(leftAfterRightDrag!.y - leftAfter!.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(rightAfter!.y - rightAfterLeftDrag!.y)).toBeGreaterThan(10)
    } finally {
      await closeApp(app, userDataDir)
    }
  })

  test('可将标签拖到工作区右侧创建分屏', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      for (const [name, host] of [['TAB-拖拽-A', '10.0.3.1'], ['TAB-拖拽-B', '10.0.3.2']]) {
        await invokeStorage(app, 'addConnection', {
          name,
          connectionType: 'telnet',
          host,
          port: 23
        })
      }
      await page.reload()
      await page.waitForSelector('.app-container', { timeout: 30000 })

      const group = page.locator('.connection-group').filter({ hasText: 'TELNET' }).first()
      for (const name of ['TAB-拖拽-A', 'TAB-拖拽-B']) {
        await group
          .locator('.connection-card')
          .filter({ hasText: name })
          .first()
          .getByRole('button', { name: '连接' })
          .click()
      }

      const workspace = page.locator('.split-workspace')
      const workspaceBox = await workspace.boundingBox()
      expect(workspaceBox).not.toBeNull()
      const draggedTab = page
        .locator('.tab-item')
        .filter({ hasText: 'TAB-拖拽-B' })
        .first()
      const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
      const dropPoint = {
        clientX: workspaceBox!.x + workspaceBox!.width - 20,
        clientY: workspaceBox!.y + workspaceBox!.height / 2
      }
      await draggedTab.dispatchEvent('dragstart', { dataTransfer })
      await workspace.dispatchEvent('dragover', { dataTransfer, ...dropPoint })
      await workspace.dispatchEvent('drop', { dataTransfer, ...dropPoint })
      await draggedTab.dispatchEvent('dragend', { dataTransfer })

      await expect(page.locator('.split-resizer')).toBeVisible()
      await expect(page.locator('.panel-inner')).toHaveCount(2)
      await expect(page.locator('.panel-terminal-area .telnet-terminal:visible')).toHaveCount(2)
    } finally {
      await closeApp(app, userDataDir)
    }
  })

  test('同一分屏中的每个标签独立保存底部面板高度', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      for (const [name, host] of [
        ['TAB-独立-A', '10.0.1.1'],
        ['TAB-独立-B', '10.0.1.2'],
        ['TAB-独立-C', '10.0.1.3']
      ]) {
        await invokeStorage(app, 'addConnection', {
          name,
          connectionType: 'telnet',
          host,
          port: 23
        })
      }
      await page.reload()
      await page.waitForSelector('.app-container', { timeout: 30000 })

      const group = page.locator('.connection-group').filter({ hasText: 'TELNET' }).first()
      for (const name of ['TAB-独立-A', 'TAB-独立-B', 'TAB-独立-C']) {
        await group
          .locator('.connection-card')
          .filter({ hasText: name })
          .first()
          .getByRole('button', { name: '连接' })
          .click()
      }
      await expect(page.locator('.tab-item')).toHaveCount(3)

      const visibleRoot = page.locator('.unified-terminal:visible')
      const visibleSplitter = page.locator('.vertical-splitter:visible')
      const dragVisibleSplitter = async (ratio: number): Promise<number> => {
        const rootBox = await visibleRoot.boundingBox()
        const splitterBox = await visibleSplitter.boundingBox()
        expect(rootBox).not.toBeNull()
        expect(splitterBox).not.toBeNull()

        await page.mouse.move(splitterBox!.x + splitterBox!.width / 2, splitterBox!.y + 2)
        await page.mouse.down()
        await page.mouse.move(
          splitterBox!.x + splitterBox!.width / 2,
          rootBox!.y + rootBox!.height * ratio
        )
        await page.mouse.up()

        const result = await visibleSplitter.boundingBox()
        expect(result).not.toBeNull()
        return result!.y
      }
      const switchTo = async (name: string): Promise<number> => {
        const tab = page.locator('.tab-item').filter({ hasText: name }).first()
        await tab.click()
        await expect(tab).toHaveClass(/active/)
        const result = await visibleSplitter.boundingBox()
        expect(result).not.toBeNull()
        return result!.y
      }

      // C 当前激活，将同一分屏内的三个标签分别调整为明显不同的高度。
      const cHeight = await dragVisibleSplitter(0.3)
      await switchTo('TAB-独立-B')
      const bHeight = await dragVisibleSplitter(0.55)
      await switchTo('TAB-独立-A')
      const aHeight = await dragVisibleSplitter(0.8)

      expect(Math.abs(aHeight - bHeight)).toBeGreaterThan(10)
      expect(Math.abs(bHeight - cHeight)).toBeGreaterThan(10)

      // 反复切换后，每个标签恢复自己的高度，而不是采用当前分屏的共享高度。
      expect(Math.abs((await switchTo('TAB-独立-C')) - cHeight)).toBeLessThanOrEqual(1)
      expect(Math.abs((await switchTo('TAB-独立-B')) - bHeight)).toBeLessThanOrEqual(1)
      expect(Math.abs((await switchTo('TAB-独立-A')) - aHeight)).toBeLessThanOrEqual(1)

      // 关闭当前标签后，下一标签仍使用自己的已保存高度。
      const activeTab = page.locator('.tab-item.active').first()
      await activeTab.hover()
      await activeTab.locator('.tab-action-btn').click()
      await expect(page.locator('.tab-item')).toHaveCount(2)
      const remainingHeight = await visibleSplitter.boundingBox()
      expect(remainingHeight).not.toBeNull()
      const matchesB = Math.abs(remainingHeight!.y - bHeight) <= 1
      const matchesC = Math.abs(remainingHeight!.y - cHeight) <= 1
      expect(matchesB || matchesC).toBe(true)
    } finally {
      await closeApp(app, userDataDir)
    }
  })

  test('选项卡右键菜单可关闭单个选项卡', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      await invokeStorage(app, 'addConnection', {
        name: 'TAB-右键',
        connectionType: 'telnet',
        host: '10.0.0.3',
        port: 23
      })
      await page.reload()
      await page.waitForSelector('.app-container', { timeout: 30000 })

      const group = page.locator('.connection-group').filter({ hasText: 'TELNET' }).first()
      await group
        .locator('.connection-card')
        .filter({ hasText: 'TAB-右键' })
        .first()
        .getByRole('button', { name: '连接' })
        .click()
      await expect(page.locator('.tab-item')).toHaveCount(1)

      // 右键选项卡，出现上下文菜单
      await page
        .locator('.tab-item')
        .filter({ hasText: 'TAB-右键' })
        .first()
        .click({ button: 'right' })
      const contextMenu = page.locator('.context-menu')
      await expect(contextMenu).toBeVisible()

      // 点击"关闭"
      await contextMenu.locator('.menu-item').filter({ hasText: '关闭' }).first().click()

      // 选项卡关闭，空状态恢复
      await expect(page.locator('.tab-item')).toHaveCount(0)
      await expect(page.locator('.empty-tabs-placeholder')).toBeVisible()
    } finally {
      await closeApp(app, userDataDir)
    }
  })

  test('选项卡关闭按钮可关闭选项卡', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      await invokeStorage(app, 'addConnection', {
        name: 'TAB-关闭按钮',
        connectionType: 'telnet',
        host: '10.0.0.4',
        port: 23
      })
      await page.reload()
      await page.waitForSelector('.app-container', { timeout: 30000 })

      const group = page.locator('.connection-group').filter({ hasText: 'TELNET' }).first()
      await group
        .locator('.connection-card')
        .filter({ hasText: 'TAB-关闭按钮' })
        .first()
        .getByRole('button', { name: '连接' })
        .click()
      await expect(page.locator('.tab-item')).toHaveCount(1)

      // 悬停使关闭按钮可见并点击
      const tab = page.locator('.tab-item').filter({ hasText: 'TAB-关闭按钮' }).first()
      await tab.hover()
      await tab.locator('.tab-action-btn').click()

      await expect(page.locator('.tab-item')).toHaveCount(0)
      await expect(page.locator('.empty-tabs-placeholder')).toBeVisible()
    } finally {
      await closeApp(app, userDataDir)
    }
  })
})
