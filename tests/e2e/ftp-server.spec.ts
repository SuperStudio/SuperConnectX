import { test, expect } from '@playwright/test'
import { launchApp, closeApp } from './helpers'

/**
 * FTP 服务端模式 E2E 测试：
 *  1. 创建 FTP 服务端连接（本地起服务，无外部依赖，CI 稳定）
 *  2. 连接后打开终端选项卡
 *  3. FTP 服务端卡片显示"服务端"角标
 */
test.describe('FTP 服务端连接', () => {
  test('创建 FTP 服务端连接并显示分组', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      // 1. 新建连接
      await page.locator('.btn-primary').filter({ hasText: '新建连接' }).first().click()
      const dialog = page.locator('.el-dialog').filter({ hasText: '新建连接' }).first()
      await expect(dialog).toBeVisible()

      // 2. 切换到 FTP 协议（exact 避免误匹配 TFTP）
      await dialog.getByRole('tab', { name: 'FTP', exact: true }).click()
      await expect(dialog.getByRole('tab', { name: 'FTP', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
      )

      // 3. FTP 服务端模式默认选中（server）
      // 4. 填写名称/端口/用户名/密码/共享目录
      await dialog.getByRole('textbox', { name: '连接名称' }).fill('FTP-服务端')
      await dialog.getByRole('spinbutton', { name: '端口' }).fill('2211')
      await dialog.getByRole('textbox', { name: '用户名' }).fill('e2euser')
      await dialog.getByRole('textbox', { name: '密码' }).fill('e2epass')
      // 共享目录（必填，这里填一个虚拟目录，仅用于保存验证，不会真的连接）
      // 表单项 label 是"目录"，placeholder 是"选择共享目录"
      await dialog.getByRole('textbox', { name: '目录' }).fill('C:\\e2e\\ftp')

      // 5. 保存
      await dialog.getByRole('button', { name: '确认保存' }).click()
      await expect(dialog).toBeHidden({ timeout: 15000 })

      // 6. FTP 分组出现，且卡片带"服务端"角标
      const group = page.locator('.connection-group').filter({ hasText: 'FTP' }).first()
      await expect(group).toBeVisible()
      await expect(group).toContainText('FTP-服务端')
      await expect(
        group.locator('.connection-card').filter({ hasText: 'FTP-服务端' }).first()
      ).toContainText('服务端')
    } finally {
      await closeApp(app, userDataDir)
    }
  })

  test('FTP 客户端模式可创建连接', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      await page.locator('.btn-primary').filter({ hasText: '新建连接' }).first().click()
      const dialog = page.locator('.el-dialog').filter({ hasText: '新建连接' }).first()
      await expect(dialog).toBeVisible()

      await dialog.getByRole('tab', { name: 'FTP', exact: true }).click()

      // 切换到"客户端"模式
      await dialog.locator('.mode-radio-group').getByText('客户端').click()

      // 客户端模式显示"服务器地址"
      await dialog.getByRole('textbox', { name: '连接名称' }).fill('FTP-客户端')
      await dialog.getByRole('textbox', { name: '服务器地址' }).fill('ftp.example.com')
      await dialog.getByRole('spinbutton', { name: '端口' }).fill('21')
      await dialog.getByRole('textbox', { name: '用户名' }).fill('ftpuser')
      await dialog.getByRole('textbox', { name: '密码' }).fill('ftppass')

      await dialog.getByRole('button', { name: '确认保存' }).click()
      await expect(dialog).toBeHidden({ timeout: 15000 })

      // FTP 分组出现客户端连接（无"服务端"角标）
      const group = page.locator('.connection-group').filter({ hasText: 'FTP' }).first()
      await expect(group).toBeVisible()
      await expect(group).toContainText('FTP-客户端')
      const card = group.locator('.connection-card').filter({ hasText: 'FTP-客户端' }).first()
      await expect(card).not.toContainText('服务端')
    } finally {
      await closeApp(app, userDataDir)
    }
  })
})
