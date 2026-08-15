import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * E2E 辅助函数：启动 Electron 应用。
 *
 * 通过 SCX_USER_DATA_DIR 环境变量将 userData 指向独立的临时目录，
 * 保证测试不会污染开发者本地真实数据。测试结束会自动清理临时目录。
 */
export async function launchApp(
  opts: { args?: string[] } = {}
): Promise<{ app: ElectronApplication; page: Page; userDataDir: string }> {
  // 为每个用例创建独立的临时 userData 目录
  const userDataDir = mkdtempSync(join(tmpdir(), 'scx-e2e-'))

  const app = await electron.launch({
    args: ['.', ...(opts.args ?? [])],
    cwd: process.cwd(),
    // CI/headless 环境下无需显示服务器即可运行 Electron
    headless: process.env.E2E_HEADLESS === '1',
    env: {
      ...process.env,
      SCX_USER_DATA_DIR: userDataDir
    }
  })

  const page = await app.firstWindow()

  // 强制使用中文 locale，保证测试断言（如“新建连接”“文件”）在任意系统语言下都稳定。
  // addInitScript 在每次页面加载的脚本执行前运行，reload 后 Vue 初始化前就会写入 localStorage，
  // 从而覆盖 getSavedLocale() 基于 navigator.language 的自动检测（CI 上通常是 en-US）。
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'zh-CN')
  })
  await page.reload()

  // 等待渲染进程挂载完成（#app 下的主要内容出现）
  await page.waitForSelector('.app-container', { timeout: 30000 })

  return { app, page, userDataDir }
}

/**
 * 关闭应用并清理临时 userData 目录。
 */
export async function closeApp(app: ElectronApplication, userDataDir: string): Promise<void> {
  try {
    await app.close()
  } catch {
    // ignore: 应用可能已崩溃
  }
  try {
    rmSync(userDataDir, { recursive: true, force: true })
  } catch {
    // ignore: Windows 上文件可能被锁定
  }
}

/**
 * 通过主进程访问当前窗口的渲染进程，调用 preload 暴露的 storageApi 方法（绕过 UI）。
 * 用于准备/校验测试数据。method 是 storageApi 的方法名（如 'addConnection'）。
 *
 * 注意：app.evaluate 回调运行在主进程上下文，需要通过 BrowserWindow 获取 webContents
 * 再执行 webContents.executeJavaScript 去调用渲染进程的 window.storageApi。
 */
export async function invokeStorage(
  app: ElectronApplication,
  method: string,
  ...args: unknown[]
): Promise<unknown> {
  return app.evaluate(
    async ({ BrowserWindow }, { m, a }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
      if (!win) return null
      const js = `(() => {
      const api = window.storageApi || null
      if (!api || typeof api[${JSON.stringify(m)}] !== 'function') return null
      return api[${JSON.stringify(m)}](...${JSON.stringify(a)})
    })()`
      return win.webContents.executeJavaScript(js)
    },
    { m: method, a: args }
  )
}
