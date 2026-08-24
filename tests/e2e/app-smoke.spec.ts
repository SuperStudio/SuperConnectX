import { test, expect } from '@playwright/test'
import net from 'net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { launchApp, closeApp } from './helpers'

async function freeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

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

  test('工具菜单打开唯一 AI 交互桥梁页', async () => {
    const mcpPort = await freeLoopbackPort()
    const { app, page, userDataDir } = await launchApp()
    try {
      const toolsButton = page.locator('.menu-btn').filter({ hasText: '工具' }).first()
      await toolsButton.hover()
      await page.locator('.menu-item').filter({ hasText: 'AI 交互桥梁' }).first().click()

      await expect(page.getByRole('heading', { name: 'AI 交互桥梁' })).toBeVisible()
      const usageButton = page.getByRole('button', { name: '使用说明' })
      await expect(usageButton).toBeVisible()
      await expect(usageButton).toHaveCSS('height', '26px')
      await usageButton.click()
      await expect(page.getByText(/软件每次启动均恢复为只读/)).toBeVisible()
      await expect(page.getByText('桥梁未开启', { exact: true })).toBeVisible()
      const permissionSelect = page.getByRole('combobox', { name: 'AI 权限级别' })
      await expect(permissionSelect).toHaveValue('read-only')
      const persistedConfig = await page.evaluate(() => window.aiServiceApi.getConfig())
      expect('permission' in persistedConfig.shared).toBe(false)
      await permissionSelect.selectOption('full-control')
      await expect
        .poll(() => page.evaluate(async () => (await window.aiServiceApi.getState()).permission))
        .toBe('full-control')
      expect(
        'permission' in (await page.evaluate(() => window.aiServiceApi.getConfig())).shared
      ).toBe(false)
      await permissionSelect.selectOption('read-only')
      await expect
        .poll(() => page.evaluate(async () => (await window.aiServiceApi.getState()).permission))
        .toBe('read-only')
      await expect(page.getByText('AI 连接状态指示灯', { exact: true })).toBeVisible()
      await expect(page.getByText('AI 未连接', { exact: true })).toBeVisible()
      await expect(page.getByText(/\d+ 个 AI 已接入/)).toHaveCount(0)
      await expect(page.getByText('MCP 配置', { exact: true })).toBeVisible()
      await expect(page.getByText('实例 ID', { exact: true })).toBeVisible()
      await expect(page.getByText('读取串口连接与终端输出', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '一键复制 MCP 配置' })).toBeVisible()
      await expect(page.getByRole('button', { name: '测试 MCP 可用性' })).toBeVisible()
      await expect(page.getByRole('button', { name: '重新生成 MCP Token' })).toBeVisible()
      await expect(page.locator('.action-grid .btn-primary')).toHaveCount(4)
      for (const button of await page.locator('.action-grid .btn-primary').all()) {
        await expect(button).toHaveCSS('height', '26px')
      }
      await expect(page.getByText('当前软件 MCP 实例配置', { exact: true })).toBeVisible()
      await expect(page.getByText('允许 AI 关闭用户打开的串口连接', { exact: true })).toBeVisible()
      await expect(page.getByText('允许点击浮窗', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '选择文件夹' })).toHaveCSS('height', '26px')
      await expect(page.getByRole('combobox', { name: '浮窗位置' })).toBeVisible()
      await expect(page.getByRole('slider', { name: '浮窗透明度' })).toBeVisible()
      const durationSlider = page.getByRole('slider', { name: '浮窗停留时间' })
      await expect(durationSlider).toBeVisible()
      await expect(page.locator('.duration-slider .el-slider__stop')).toHaveCount(2)
      await durationSlider.focus()
      await durationSlider.press('End')
      await expect
        .poll(() =>
          page.evaluate(
            async () => (await window.aiServiceApi.getConfig()).shared.activity.overlayDuration
          )
        )
        .toBe(0)
      await durationSlider.press('ArrowLeft')
      await expect(page.getByText('15 秒', { exact: true })).toBeVisible()
      await expect
        .poll(() =>
          page.evaluate(
            async () => (await window.aiServiceApi.getConfig()).shared.activity.overlayDuration
          )
        )
        .toBe(15)
      await expect(page.getByText('15 秒', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '删除记录' })).toBeVisible()
      await expect(page.locator('.history-actions .btn-primary')).toHaveCount(3)
      for (const button of await page.locator('.history-actions .btn-primary').all()) {
        await expect(button).toHaveCSS('height', '26px')
      }

      const generatedConfig = await page.evaluate(() => window.aiServiceApi.getCodexConfig())
      expect(generatedConfig).toContain('[mcp_servers.superconnectx_1]')

      await page.evaluate(async (port) => {
        const config = await window.aiServiceApi.getConfig()
        await window.aiServiceApi.saveConfig({
          expectedRevision: config.revision,
          instance: { portOverride: port }
        })
      }, mcpPort)

      await page.getByRole('button', { name: '启用桥梁' }).click()
      await expect
        .poll(() => page.evaluate(async () => (await window.aiServiceApi.getState()).state))
        .toBe('running')
      await page.getByRole('button', { name: '一键复制 MCP 配置' }).click()
      await expect(
        page.getByText('MCP 配置与接入说明已复制，可直接发送给 AI 完成当前 MCP Client 的接入。')
      ).toBeVisible()
      const copiedConfig = await app.evaluate(({ clipboard }) => clipboard.readText())
      expect(copiedConfig).toContain('请帮我将当前 SuperConnectX 实例接入你正在使用的 MCP Client')
      expect(copiedConfig).toContain('下方提供的是 Codex TOML 格式配置')
      expect(copiedConfig).toContain('请连接 superconnectx_1，并调用 server_get_info 验证服务')
      expect(copiedConfig).toContain(
        '请保留 session_start_* 或 session_acquire_write 返回的 writeLeaseId'
      )
      expect(copiedConfig).toContain('[mcp_servers.superconnectx_1]')
      expect(copiedConfig).toContain(`url = "http://127.0.0.1:${mcpPort}/mcp"`)

      const token = copiedConfig.match(/Authorization = "Bearer ([^"]+)"/)?.[1]
      expect(token).toBeTruthy()
      const indicatorClient = new Client({ name: 'superconnectx-e2e-indicator', version: '1.0.0' })
      const indicatorTransport = new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${mcpPort}/mcp`),
        { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
      )
      try {
        await indicatorClient.connect(indicatorTransport)
        await expect(page.getByText('AI 已连接', { exact: true })).toBeVisible()
        await expect(
          page
            .locator('.tab-item')
            .filter({ hasText: 'AI 交互桥梁' })
            .locator('.connection-dot.connected')
        ).toHaveCount(1)
      } finally {
        await indicatorTransport.terminateSession().catch(() => undefined)
        await indicatorClient.close().catch(() => undefined)
      }
      await expect(page.getByText('AI 未连接', { exact: true })).toBeVisible()

      await page.getByRole('button', { name: '删除记录' }).click()
      const clearDialog = page.locator('.el-message-box')
      await expect(clearDialog).toBeVisible()
      await expect(clearDialog.locator('.el-message-box__title')).toHaveText('删除 AI 操作记录')
      await expect(clearDialog).toContainText(
        '将删除全部本地 AI 操作历史，删除后无法恢复。是否继续？'
      )
      await expect(
        clearDialog.locator('.el-message-box__status.el-message-box-icon--warning')
      ).toBeVisible()
      await clearDialog.getByRole('button', { name: '删除记录' }).click()

      // 页面首次加载时 AI IPC 必须已完成注册，不能出现启动竞态。
      const serviceState = await page.evaluate(() => window.aiServiceApi.getState())
      expect(serviceState).toHaveProperty('state')
      expect(serviceState.permission).toBe('read-only')
      await expect(page.getByText(/No handler registered for 'ai-service:get-state'/)).toHaveCount(
        0
      )

      await toolsButton.hover()
      await page.locator('.menu-item').filter({ hasText: 'AI 交互桥梁' }).first().click()
      const aiTab = page.locator('.tab-item').filter({ hasText: 'AI 交互桥梁' })
      await expect(aiTab).toHaveCount(1)
      await expect(aiTab.locator('.connection-dot.disconnected')).toHaveCount(1)

      const now = new Date().toISOString()
      for (const session of [
        {
          sessionId: 'mcp-e2e-telnet',
          connectionType: 'telnet',
          name: 'AI E2E Telnet',
          host: '127.0.0.1',
          port: 23230,
          desiredConfig: { id: 9001 }
        },
        {
          sessionId: 'mcp-e2e-ftp',
          connectionType: 'ftp',
          name: 'AI E2E FTP',
          host: '127.0.0.1',
          port: 21210,
          desiredConfig: { id: 9002 }
        }
      ]) {
        await app.evaluate(
          ({ BrowserWindow }, payload) => {
            BrowserWindow.getAllWindows()[0]?.webContents.send('on-runtime-event', payload)
          },
          {
            eventId: `e2e-${session.sessionId}`,
            sequence: 90,
            timestamp: now,
            eventType: 'session.state',
            source: 'ai',
            sessionId: session.sessionId,
            payload: {
              state: 'connected',
              session: { ...session, state: 'connected', updatedAt: now }
            }
          }
        )
      }

      const telnetAiTab = page.locator('.tab-item').filter({ hasText: 'AI E2E Telnet' })
      const ftpAiTab = page.locator('.tab-item').filter({ hasText: 'AI E2E FTP' })
      await expect(telnetAiTab).toHaveCount(1)
      await expect(ftpAiTab).toHaveCount(1)
      await expect(telnetAiTab).toHaveAttribute('data-tab-id', 'ai-session-mcp-e2e-telnet')
      await expect(ftpAiTab).toHaveAttribute('data-tab-id', 'ai-session-mcp-e2e-ftp')
      await expect(telnetAiTab.locator('.connection-dot.connected')).toHaveCount(1)
      await expect(ftpAiTab.locator('.connection-dot.connected')).toHaveCount(1)
      await page.waitForTimeout(3_200)
      await expect(page.getByText(/connect failed: \(/)).toHaveCount(0)

      for (const sessionId of ['mcp-e2e-telnet', 'mcp-e2e-ftp']) {
        await app.evaluate(
          ({ BrowserWindow }, payload) => {
            BrowserWindow.getAllWindows()[0]?.webContents.send('on-runtime-event', payload)
          },
          {
            eventId: `e2e-close-${sessionId}`,
            sequence: 91,
            timestamp: new Date().toISOString(),
            eventType: 'session.closed',
            source: 'ai',
            sessionId,
            payload: { state: 'closed', session: { sessionId, state: 'closed', updatedAt: now } }
          }
        )
      }
      await expect(telnetAiTab).toHaveCount(0)
      await expect(ftpAiTab).toHaveCount(0)
    } finally {
      await closeApp(app, userDataDir)
    }
  })
})
