/**
 * Telnet 终端模式实测脚本（回归验证用，长期保留）
 *
 * 前置：先执行 electron-vite build 生成 out/ 产物（启动的是打包后的主进程入口）
 * 用法：node scripts/verify-telnet-terminal-mode.cjs
 * 注意：shell 若注入了 ELECTRON_RUN_AS_NODE=1 需先清除，否则 electron 以纯 Node 模式启动
 *
 * 场景：Telnet 服务器输出裸 \n（无 \r），验证：
 *   1. 通过视图菜单开启终端模式
 *   2. 在 xterm 里敲命令回车 -> mock 服务器收到 \r 应能识别并回显
 *   3. 回显行应在 xterm 中正常换行（不再挤在一行）
 */
const fs = require('fs')
const path = require('path')
const net = require('net')
const os = require('os')
const { _electron: electron } = require('playwright')

const REPO_ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(REPO_ROOT, 'tests', 'report', 'terminal-shots')
const LOG_FILE = path.join(OUT_DIR, 'verify-telnet-terminal-mode.log')

function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`
  fs.appendFileSync(LOG_FILE, line + '\n')
  console.log(line)
}

function startTelnetServer() {
  const server = net.createServer((socket) => {
    let line = ''
    socket.write('Welcome to mock telnet\n')
    socket.write('$ ')
    socket.on('data', (d) => {
      for (const ch of d.toString()) {
        if (ch === '\r' || ch === '\n') {
          const cmd = line.trim()
          line = ''
          if (cmd) socket.write(`${cmd}: executed\n`)
          socket.write('$ ')
        } else {
          line += ch
        }
      }
    })
    socket.on('error', () => {})
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(LOG_FILE, '')

  const { server, port } = await startTelnetServer()
  log(`mock telnet server listening on 127.0.0.1:${port}`)

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-tn-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: REPO_ROOT,
    headless: false,
    env: { ...process.env, SCX_USER_DATA_DIR: userDataDir }
  })

  try {
    const page = await app.firstWindow()
    await page.waitForTimeout(4000)

    // ---------- 1. 新建 Telnet 连接 ----------
    await page.locator('.sidebar-action-btn, .add-connection-btn').first().click().catch(() => {})
    await page.waitForTimeout(800)
    let dialog = page.locator('.el-dialog').filter({ hasText: 'Telnet' }).first()
    if (!(await dialog.isVisible().catch(() => false))) {
      await page.locator('.el-button').filter({ hasText: '新建' }).first().click().catch(() => {})
      await page.waitForTimeout(800)
      dialog = page.locator('.el-dialog').filter({ hasText: 'Telnet' }).first()
    }
    await dialog.locator('.el-tabs__item', { hasText: 'Telnet' }).first().click()
    await page.waitForTimeout(300)

    const fillByLabel = async (labelText, value) => {
      const item = dialog.locator('.el-form-item').filter({ hasText: labelText }).first()
      const input = item.locator('input').first()
      await input.click()
      await input.fill(value)
    }
    await fillByLabel('连接名称', 'TN-终端模式')
    await fillByLabel('服务器地址', '127.0.0.1')
    await fillByLabel('端口', String(port))
    await page.waitForTimeout(300)
    await dialog.locator('.el-button').filter({ hasText: '确认保存' }).first().click()
    await page.waitForTimeout(1500)

    // ---------- 2. 连接 ----------
    let card = page.locator('[class*="connection"]').filter({ hasText: 'TN-终端模式' }).first()
    await card.dblclick()
    log('已发起连接')
    await page.waitForTimeout(4000)
    await page.screenshot({ path: path.join(OUT_DIR, 'tn-1-connected.png') })

    // ---------- 3. 视图菜单开启终端模式 ----------
    await page.locator('.menu-btn').filter({ hasText: '视图' }).first().click()
    await page.waitForTimeout(600)
    await page.locator('.dropdown-menu .checkbox-item').filter({ hasText: '终端模式' }).first().click()
    await page.waitForTimeout(1500)
    const xtermCount = await page.locator('.xterm-screen').count()
    log(`开启终端模式后 xterm 实例数=${xtermCount}`)

    if (xtermCount > 0) {
      // ---------- 4. 敲命令并回车 ----------
      await page.locator('.xterm-screen').first().click()
      await page.waitForTimeout(300)
      await page.keyboard.type('echo one')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1000)
      await page.keyboard.type('echo two')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1000)
      await page.screenshot({ path: path.join(OUT_DIR, 'tn-2-commands.png') })

      // ---------- 5. 断言：两条命令输出应在不同行 ----------
      const rows = await page.locator('.xterm-rows > div').allInnerTexts()
      const rowIdx = (text) => rows.findIndex((r) => r.includes(text))
      const i1 = rowIdx('echo one: executed')
      const i2 = rowIdx('echo two: executed')
      log(`"echo one: executed" 所在行=${i1}，"echo two: executed" 所在行=${i2}`)
      log(i1 >= 0 && i2 >= 0 && i1 !== i2 ? 'PASS: 输出正常换行' : 'FAIL: 输出挤在一行或未收到')
      log(`回车识别（服务器收到 \\r 并回显）: ${i1 >= 0 ? 'PASS' : 'FAIL'}`)
    }
  } catch (err) {
    log(`ERROR: ${err && err.stack ? err.stack : err}`)
  } finally {
    await app.close().catch(() => {})
    server.close()
    log('done')
  }
}

main()
