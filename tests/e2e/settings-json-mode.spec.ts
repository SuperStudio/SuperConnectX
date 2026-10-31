import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type ElectronApplication, type Page } from './helpers'

/**
 * 设置页 JSON 编辑模式 E2E
 *
 * 顶部“编辑 JSON”按钮切换到 Monaco 编辑器直接修改 settings.json，
 * 工具栏的“返回表单”按钮切回表单视图；JSON 非法时禁止返回。
 */
async function openSettings(page: Page) {
  await page.locator('.menu-button', { has: page.locator('.menu-btn', { hasText: '工具' }) }).hover()
  await page.locator('.dropdown-menu .menu-item', { hasText: '设置' }).first().click()
  await page.waitForSelector('.settings-page', { timeout: 10000 })
}

test.describe('Settings JSON editing mode', () => {
  let app: ElectronApplication
  let page: Page
  let userDataDir: string

  test.beforeEach(async () => {
    ;({ app, page, userDataDir } = await launchApp())
    await openSettings(page)
  })

  test.afterEach(async () => {
    await closeApp(app, userDataDir)
  })

  test('切换按钮进入 JSON 视图，再点击返回表单', async () => {
    await page.locator('.json-mode-toggle').click()

    await expect(page.locator('.settings-json-view')).toBeVisible()
    // 表单/搜索栏已让位给 JSON 编辑器
    await expect(page.locator('.settings-search-bar')).toBeHidden()
    await expect(page.locator('.settings-nav')).toBeHidden()
    // Monaco 渲染出编辑器（按需动态加载）
    await expect(page.locator('.settings-json-editor .monaco-editor')).toBeVisible({ timeout: 20000 })

    await page.locator('.settings-json-toolbar button', { hasText: '返回表单' }).click()
    await expect(page.locator('.settings-json-view')).toBeHidden()
    await expect(page.locator('.settings-search-bar')).toBeVisible()
    await expect(page.locator('[data-setting-id="basic.language"]')).toBeVisible()
  })

  test('输入非法 JSON 时提示错误并阻止返回表单', async () => {
    await page.locator('.json-mode-toggle').click()
    const editor = page.locator('.settings-json-editor .monaco-editor')
    await expect(editor).toBeVisible({ timeout: 20000 })

    // selectAll + insertText：monaco 0.55 使用 EditContext 输入，逐字符输入会触发自动补全括号
    await editor.locator('.view-lines').click()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    await page.keyboard.insertText('{ this is not json')

    await expect(page.locator('.settings-json-error')).toBeVisible({ timeout: 10000 })

    await page.locator('.settings-json-toolbar button', { hasText: '返回表单' }).click()
    await expect(page.locator('.settings-json-view')).toBeVisible()

    // 修正为合法 JSON 后错误消失，可以正常返回
    await editor.locator('.view-lines').click()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    await page.keyboard.insertText('{ "maxDisplayText": 42 }')
    await expect(page.locator('.settings-json-error')).toBeHidden({ timeout: 10000 })
    await page.locator('.settings-json-toolbar button', { hasText: '返回表单' }).click()
    await expect(page.locator('.settings-json-view')).toBeHidden()
  })

  test('编辑 JSON 后自动应用，表单同步为最新值', async () => {
    await page.locator('.json-mode-toggle').click()
    const editor = page.locator('.settings-json-editor .monaco-editor')
    await expect(editor).toBeVisible({ timeout: 20000 })

    // monaco 0.55 使用 EditContext（非 inputarea）：全选后删除再写入，避免自动补全括号
    await editor.locator('.view-lines').click()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    await page.keyboard.insertText('{ "maxDisplayText": 66 }')

    await expect(page.locator('.settings-json-status.applied')).toBeVisible({ timeout: 10000 })

    await page.locator('.settings-json-toolbar button', { hasText: '返回表单' }).click()
    const maxDisplayText = page.locator('[data-setting-id="basic.maxDisplayText"]')
    await expect(maxDisplayText).toBeVisible()
    await expect(maxDisplayText.locator('.slider-value')).toHaveText('66 MB')
  })
})
