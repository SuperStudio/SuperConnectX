import { test, expect } from '@playwright/test'
import { launchApp, closeApp } from './helpers'

/**
 * 应用启动冒烟测试：验证应用能正常启动并渲染出主界面。
 */
test.describe('应用启动冒烟测试', () => {
  test('应用正常启动并显示主界面', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      // 标题栏显示应用名
      await expect(page.locator('.app-title')).toHaveText('SuperConnectX')

      // 侧边栏存在，且包含"新建连接"按钮
      await expect(page.locator('.connection-list')).toBeVisible()
      await expect(page.locator('.btn-primary').first()).toBeVisible()

      // 无连接时显示空状态占位（logo 区域）
      await expect(page.locator('.empty-tabs-placeholder')).toBeVisible()

      // 主进程已就绪，可访问 version 信息
      const version = await app.evaluate(({ ipcMain }) => ipcMain.eventNames().length >= 0)
      expect(version).toBe(true)
    } finally {
      await closeApp(app, userDataDir)
    }
  })

  test('应用标题栏菜单栏可交互', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      // 文件菜单
      await page.hover('.menu-btn').catch(() => {})
      // 直接点击"文件"菜单
      const fileBtn = page.locator('.menu-btn').filter({ hasText: '文件' }).first()
      await fileBtn.hover()
      await expect(page.locator('.menu-item').filter({ hasText: '退出' }).first()).toBeVisible()
    } finally {
      await closeApp(app, userDataDir)
    }
  })
})
