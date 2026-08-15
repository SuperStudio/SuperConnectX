import { test, expect } from '@playwright/test'
import { launchApp, closeApp, invokeStorage } from './helpers'

/**
 * 连接 CRUD E2E 测试：
 *  1. 新建连接
 *  2. 编辑连接
 *  3. 删除连接（含确认弹窗）
 *  4. 搜索过滤
 */
test.describe('连接 CRUD', () => {
  test('创建 Telnet 连接后可以编辑名称', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      // 1. 新建连接
      await page.locator('.btn-primary').filter({ hasText: '新建连接' }).first().click()
      const dialog = page.locator('.el-dialog').filter({ hasText: '新建连接' }).first()
      await expect(dialog).toBeVisible()

      await dialog.getByRole('tab', { name: 'Telnet' }).click()
      await dialog.getByRole('textbox', { name: '连接名称' }).fill('CRUD-编辑测试')
      await dialog.getByRole('textbox', { name: '服务器地址' }).fill('192.168.1.200')
      await dialog.getByRole('spinbutton', { name: '端口' }).fill('23')
      await dialog.getByRole('button', { name: '确认保存' }).click()
      await expect(dialog).toBeHidden({ timeout: 15000 })

      // 2. 验证连接出现在 TELNET 分组
      const group = page.locator('.connection-group').filter({ hasText: 'TELNET' }).first()
      await expect(group).toBeVisible()
      await expect(group).toContainText('CRUD-编辑测试')

      // 3. 点击"编辑"
      const card = group.locator('.connection-card').filter({ hasText: 'CRUD-编辑测试' }).first()
      await card.getByRole('button', { name: '编辑' }).click()

      // 编辑对话框标题为"编辑连接"
      const editDialog = page.locator('.el-dialog').filter({ hasText: '编辑连接' }).first()
      await expect(editDialog).toBeVisible()

      // 4. 修改名称
      const nameInput = editDialog.getByRole('textbox', { name: '连接名称' })
      await nameInput.fill('CRUD-已改名')
      await editDialog.getByRole('button', { name: '确认保存' }).click()
      await expect(editDialog).toBeHidden({ timeout: 15000 })

      // 5. 验证新名称，旧名称不再存在
      await expect(page.locator('.connection-card').filter({ hasText: 'CRUD-已改名' })).toHaveCount(
        1
      )
      await expect(
        page.locator('.connection-card').filter({ hasText: 'CRUD-编辑测试' })
      ).toHaveCount(0)
    } finally {
      await closeApp(app, userDataDir)
    }
  })

  test('删除连接需二次确认', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      // 预置一个 Telnet 连接（绕过 UI，直接写存储）
      await invokeStorage(app, 'addConnection', {
        name: 'CRUD-待删除',
        connectionType: 'telnet',
        host: '10.0.0.5',
        port: 23
      })
      // 触发侧边栏刷新
      await page.reload()
      await page.waitForSelector('.app-container', { timeout: 30000 })

      const group = page.locator('.connection-group').filter({ hasText: 'TELNET' }).first()
      await expect(group).toBeVisible()
      await expect(group).toContainText('CRUD-待删除')

      // 点击"删除"
      const card = group.locator('.connection-card').filter({ hasText: 'CRUD-待删除' }).first()
      await card.getByRole('button', { name: '删除' }).click()

      // 出现确认弹窗（MessageBox），包含连接名
      const confirmBox = page.locator('.el-message-box').filter({ hasText: 'CRUD-待删除' }).first()
      await expect(confirmBox).toBeVisible()

      // 点击"确认"
      await confirmBox.getByRole('button', { name: '确认' }).click()
      await expect(confirmBox).toBeHidden({ timeout: 15000 })

      // 连接已从列表移除
      await expect(page.locator('.connection-card').filter({ hasText: 'CRUD-待删除' })).toHaveCount(
        0
      )
    } finally {
      await closeApp(app, userDataDir)
    }
  })

  test('搜索框可过滤连接', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      // 预置两条连接
      await invokeStorage(app, 'addConnection', {
        name: 'Alpha主机',
        connectionType: 'telnet',
        host: '10.0.0.1',
        port: 23
      })
      await invokeStorage(app, 'addConnection', {
        name: 'Beta主机',
        connectionType: 'telnet',
        host: '10.0.0.2',
        port: 23
      })
      await page.reload()
      await page.waitForSelector('.app-container', { timeout: 30000 })

      // 两条都在 TELNET 分组
      const group = page.locator('.connection-group').filter({ hasText: 'TELNET' }).first()
      await expect(group).toContainText('Alpha主机')
      await expect(group).toContainText('Beta主机')

      // 搜索"Alpha"后只显示 Alpha
      await page.locator('.connection-list-fixed input').fill('Alpha')
      await expect(page.locator('.connection-card').filter({ hasText: 'Alpha主机' })).toHaveCount(1)
      await expect(page.locator('.connection-card').filter({ hasText: 'Beta主机' })).toHaveCount(0)
    } finally {
      await closeApp(app, userDataDir)
    }
  })
})
