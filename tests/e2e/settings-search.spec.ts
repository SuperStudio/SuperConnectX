import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type ElectronApplication, type Page } from './helpers'

/**
 * 设置页搜索（过滤模式）E2E
 *
 * 布局对齐 VSCode：搜索栏横跨设置页顶部；搜索时左侧导航只保留有命中的分类
 * 并显示命中数徽标；右侧面板只显示当前分类的命中项；清空后全部恢复。
 */
async function openSettings(page: Page) {
  await page.locator('.menu-button', { has: page.locator('.menu-btn', { hasText: '工具' }) }).hover()
  await page.locator('.dropdown-menu .menu-item', { hasText: '设置' }).first().click()
  await page.waitForSelector('.settings-page', { timeout: 10000 })
}

test.describe('Settings search filtering', () => {
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

  test('搜索栏横跨顶部，搜索时过滤面板与导航并显示数量', async () => {
    // 搜索栏在顶部横跨整行（位于布局最上方，而非左侧导航内）
    const searchBox = page.locator('.settings-search-bar input.search-input')
    await expect(searchBox).toBeVisible()
    const bar = page.locator('.settings-search-bar')
    const layout = page.locator('.settings-layout')
    const barBox = await bar.boundingBox()
    const layoutBox = await layout.boundingBox()
    expect(barBox).toBeTruthy()
    expect(layoutBox).toBeTruthy()
    expect(barBox!.width).toBeGreaterThan(layoutBox!.width * 0.9)
    expect(Math.abs(barBox!.x - layoutBox!.x)).toBeLessThan(5)

    const languageItem = page.locator('[data-setting-id="basic.language"]')
    const durationItem = page.locator('[data-setting-id="basic.notificationDuration"]')
    await expect(languageItem).toBeVisible()

    await searchBox.fill('通知')

    // 右侧面板：命中项保留，未命中项隐藏
    await expect(durationItem).toBeVisible()
    await expect(languageItem).toBeHidden()

    // 顶部显示命中数
    await expect(page.locator('.settings-search-count')).toContainText('找到 1 项')

    // 左侧导航：只保留有命中的分类，并显示数量徽标
    const navItems = page.locator('.settings-nav .nav-item')
    await expect(navItems).toHaveCount(1)
    await expect(navItems.first()).toContainText('基本设置')
    await expect(navItems.first().locator('.nav-badge')).toHaveText('1')

    // 清空后恢复：导航全量显示，面板恢复
    await searchBox.fill('')
    await expect(languageItem).toBeVisible()
    await expect(durationItem).toBeVisible()
    await expect(page.locator('.settings-search-count')).toBeHidden()
    await expect(page.locator('.settings-nav .nav-item')).toHaveCount(7)
  })

  test('无匹配项时展示空态，点击搜索框清除按钮可恢复', async () => {
    const searchBox = page.locator('.settings-search-bar input.search-input')
    await searchBox.fill('这个词肯定不存在zzz')

    // 全部分类无命中 → 导航为空，右侧显示空态
    await expect(page.locator('.settings-nav .nav-item')).toHaveCount(0)
    await expect(page.locator('[data-setting-id="basic.language"]')).toBeHidden()
    await expect(page.locator('.settings-search-empty')).toBeVisible()

    // 使用输入框内的清除按钮复位
    await page.locator('.settings-search-bar .clear-btn').click()
    await expect(page.locator('[data-setting-id="basic.language"]')).toBeVisible()
    await expect(page.locator('.settings-search-empty')).toBeHidden()
    await expect(page.locator('.settings-nav .nav-item')).toHaveCount(7)
  })
})
