import { test, expect } from '@playwright/test'
import { launchApp, closeApp } from './helpers'

/**
 * 连接创建流程 E2E 测试：
 *  1. 点击侧边栏"新建连接"
 *  2. 切换协议到 Telnet
 *  3. 填写名称/地址/端口并保存
 *  4. 验证连接出现在侧边栏对应分组中
 */
test.describe('新建连接流程', () => {
  test('通过对话框创建一个 Telnet 连接', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      // 1. 点击新建连接
      await page.locator('.btn-primary').filter({ hasText: '新建连接' }).first().click()

      // 2. 对话框出现，标题为"新建连接"
      const dialog = page.locator('.el-dialog').filter({ hasText: '新建连接' }).first()
      await expect(dialog).toBeVisible()

      // 3. 切换到 Telnet 协议 tab
      await dialog.getByRole('tab', { name: 'Telnet' }).click()
      await expect(dialog.getByRole('tab', { name: 'Telnet' })).toHaveAttribute(
        'aria-selected',
        'true'
      )

      // 4. 填写表单（用无障碍角色精确定位，避免索引歧义）
      await dialog.getByRole('textbox', { name: '连接名称' }).fill('E2E-Telnet-测试')
      await dialog.getByRole('textbox', { name: '服务器地址' }).fill('192.168.1.100')
      await dialog.getByRole('spinbutton', { name: '端口' }).fill('23')

      // 5. 点击"确认保存"并等待对话框从 DOM 中移除
      await dialog.getByRole('button', { name: '确认保存' }).click()

      // 6. 对话框关闭（等待 detach 比 hidden 更可靠，Element Plus 会销毁节点）
      await expect(dialog).toBeHidden({ timeout: 15000 })

      // 7. 侧边栏出现 TELNET 分组，且包含新建的连接名
      const group = page.locator('.connection-group').filter({ hasText: 'TELNET' }).first()
      await expect(group).toBeVisible()
      await expect(group).toContainText('E2E-Telnet-测试')
      await expect(group).toContainText('192.168.1.100:23')
    } finally {
      await closeApp(app, userDataDir)
    }
  })

  test('必填字段为空时校验拦截', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      await page.locator('.btn-primary').filter({ hasText: '新建连接' }).first().click()
      const dialog = page.locator('.el-dialog').filter({ hasText: '新建连接' }).first()
      await expect(dialog).toBeVisible()

      // 不填任何字段直接保存（默认 FTP server 模式，缺少名称/端口/目录）
      await dialog.getByRole('button', { name: '确认保存' }).click()

      // 对话框不关闭，出现校验错误提示
      await expect(dialog).toBeVisible()
      await expect(page.locator('.el-message--error')).toHaveCount(1)
    } finally {
      await closeApp(app, userDataDir)
    }
  })
})
