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

/**
 * Monaco 的全选快捷键是 KeyMod.CtrlCmd | KeyA：
 * macOS 解析为 Cmd+A，Windows/Linux 解析为 Ctrl+A（macOS 上 Ctrl+A 是“光标移到行首”），
 * 因此必须按运行环境选择修饰键，否则 macOS CI 上替换全文会静默失败。
 */
const SELECT_ALL_MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control'
/** 主修饰键失效时依次尝试的候选（平台识别或键盘布局异常时的兜底） */
const SELECT_ALL_MODIFIERS = SELECT_ALL_MODIFIER === 'Meta' ? ['Meta', 'Control'] : ['Control', 'Meta']

/**
 * 用键盘整篇替换 JSON 编辑器的内容，并校验替换结果。
 *
 * monaco 0.55 使用 EditContext（无隐藏 textarea），因此统一走“全选 → 删除 → 一次性写入”。
 * 注意 monaco 会自动补全右括号（输入 `{` 时补 `}`），所以不能按字面完全一致比对，
 * 改为校验“只剩一行且包含目标文本（忽略空白差异）”，足以区分是否真的替换成功。
 * 若平台差异导致写入失败，退化为 Electron 主进程写系统剪贴板后粘贴。
 */
async function replaceEditorContent(page: Page, app: ElectronApplication, text: string) {
  const viewLines = page.locator('.settings-json-editor .view-lines')
  const flatten = (value: string) => value.replace(/\u00a0/g, ' ').replace(/\s+/g, '')
  const expected = flatten(text)

  const replaced = async () => {
    const content = flatten((await viewLines.textContent()) ?? '')
    const lines = await viewLines.locator('.view-line').count()
    return lines === 1 && content.includes(expected)
  }

  const waitReplaced = async (timeout: number) => {
    try {
      await expect.poll(replaced, { timeout }).toBe(true)
      return true
    } catch {
      return false
    }
  }

  // 方式一：全选 → 删除 → 一次性写入
  for (const modifier of SELECT_ALL_MODIFIERS) {
    await viewLines.click()
    await page.keyboard.press(`${modifier}+A`)
    await page.keyboard.press('Delete')
    await page.keyboard.insertText(text)
    if (await waitReplaced(3000)) return
  }

  // 方式二：系统剪贴板 + 粘贴
  await app.evaluate(({ clipboard }, value: string) => clipboard.writeText(value), text)
  for (const modifier of SELECT_ALL_MODIFIERS) {
    await viewLines.click()
    await page.keyboard.press(`${modifier}+A`)
    await page.keyboard.press(`${modifier}+V`)
    if (await waitReplaced(5000)) return
  }

  throw new Error(`无法替换 JSON 编辑器内容，目标片段：${expected}，当前剩余行数：${await viewLines.locator('.view-line').count()}`)
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

    await replaceEditorContent(page, app, '{ this is not json')

    await expect(page.locator('.settings-json-error')).toBeVisible({ timeout: 10000 })

    await page.locator('.settings-json-toolbar button', { hasText: '返回表单' }).click()
    await expect(page.locator('.settings-json-view')).toBeVisible()

    // 修正为合法 JSON 后错误消失，可以正常返回
    await replaceEditorContent(page, app, '{ "maxDisplayText": 42 }')
    await expect(page.locator('.settings-json-error')).toBeHidden({ timeout: 10000 })
    await page.locator('.settings-json-toolbar button', { hasText: '返回表单' }).click()
    await expect(page.locator('.settings-json-view')).toBeHidden()
  })

  test('编辑 JSON 后自动应用，表单同步为最新值', async () => {
    await page.locator('.json-mode-toggle').click()
    const editor = page.locator('.settings-json-editor .monaco-editor')
    await expect(editor).toBeVisible({ timeout: 20000 })

    await replaceEditorContent(page, app, '{ "maxDisplayText": 66 }')

    await expect(page.locator('.settings-json-status.applied')).toBeVisible({ timeout: 10000 })

    await page.locator('.settings-json-toolbar button', { hasText: '返回表单' }).click()
    const maxDisplayText = page.locator('[data-setting-id="basic.maxDisplayText"]')
    await expect(maxDisplayText).toBeVisible()
    await expect(maxDisplayText.locator('.slider-value')).toHaveText('66 MB')
  })
})
