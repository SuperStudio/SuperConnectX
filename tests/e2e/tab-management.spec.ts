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
