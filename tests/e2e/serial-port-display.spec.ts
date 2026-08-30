import { test, expect } from '@playwright/test'
import { launchApp, closeApp, invokeStorage } from './helpers'

test.describe('串口设备信息显示', () => {
  test('按默认设置显示友好名称，并保持卡片布局可用', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      const settings = (await invokeStorage(app, 'getSettings')) as Record<string, unknown>
      expect(settings.showSerialPortFriendlyName).toBe(true)
      expect(settings.showSerialPortDetails).toBe(false)

      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('list-serial-ports')
        ipcMain.handle('list-serial-ports', () => [
          {
            path: 'COM4',
            friendlyName: 'USB-Enhanced-SERIAL-A CH344 (COM4)',
            manufacturer: 'WCH',
            vendorId: '1A86',
            productId: '55D5',
            serialNumber: 'CH344-A',
            pnpId: 'USB\\VID_1A86&PID_55D5\\CH344-A',
            locationId: 'Port_#0001.Hub_#0002'
          }
        ])
      })

      await page
        .locator('.connection-group')
        .first()
        .locator('.section-header .icon-text-button')
        .click()
      const card = page.locator('.serial-port-card').filter({ hasText: 'COM4' })
      await expect(card).toBeVisible()
      await expect(card.locator('.serial-friendly-name')).toHaveText('USB-Enhanced-SERIAL-A CH344')

      const initialLayout = await card.evaluate((element) => {
        const action = element.querySelector<HTMLElement>('.serial-port-right')!
        const left = element.querySelector<HTMLElement>('.serial-port-left')!
        const dot = element.querySelector<HTMLElement>('.connection-dot')!.getBoundingClientRect()
        const content = element
          .querySelector<HTMLElement>('.serial-port-content')!
          .getBoundingClientRect()
        return {
          cardWidth: element.getBoundingClientRect().width,
          actionPosition: getComputedStyle(action).position,
          actionVisibility: getComputedStyle(action).visibility,
          actionOpacity: getComputedStyle(action).opacity,
          leftOverflowY: getComputedStyle(left).overflowY,
          centerOffset: Math.abs(dot.top + dot.height / 2 - (content.top + content.height / 2))
        }
      })
      expect(initialLayout.cardWidth).toBeLessThanOrEqual(250)
      expect(initialLayout.actionPosition).toBe('absolute')
      expect(initialLayout.actionVisibility).toBe('hidden')
      expect(initialLayout.actionOpacity).toBe('0')
      expect(initialLayout.leftOverflowY).toBe('hidden')
      expect(initialLayout.centerOffset).toBeLessThanOrEqual(1)

      await card.hover()
      await expect(card.locator('.serial-port-right')).toHaveCSS('visibility', 'visible')

      await page.evaluate(() => {
        window.dispatchEvent(
          new CustomEvent('settings-updated', {
            detail: {
              showSerialPortFriendlyName: false,
              showSerialPortDetails: true
            }
          })
        )
      })
      await expect(card.locator('.serial-friendly-name')).toHaveCount(0)
      await expect(card.locator('.serial-port-left')).toHaveCSS('overflow-y', 'hidden')
      const compactCardHeight = await card.evaluate(
        (element) => element.getBoundingClientRect().height
      )
      expect(compactCardHeight).toBeGreaterThanOrEqual(56)
      await card.locator('.serial-port-device').hover()
      await expect(page.locator('.port-detail-tooltip')).toContainText('CH344-A')
      await expect(page.locator('.port-detail-tooltip')).toContainText('1A86/55D5')
    } finally {
      await closeApp(app, userDataDir)
    }
  })
})
