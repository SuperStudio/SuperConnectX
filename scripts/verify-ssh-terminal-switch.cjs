/**
 * SSH 终端模式「切换路径」实测脚本（回归验证用，长期保留）
 *
 * 前置：先执行 electron-vite build 生成 out/ 产物（启动的是打包后的主进程入口）
 * 用法：node scripts/verify-ssh-terminal-switch.cjs
 * 注意：shell 若注入了 ELECTRON_RUN_AS_NODE=1 需先清除，否则 electron 以纯 Node 模式启动
 *
 * 复现用户路径：连接（默认终端模式） -> 取消勾选回日志模式 -> 再勾选回终端模式 -> 敲命令
 * 重点观察切换回去后 xterm 的尺寸、焦点与换行是否正常。
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
const { _electron: electron } = require('playwright')
const { Server } = require('ssh2')

const REPO_ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(REPO_ROOT, 'tests', 'report', 'terminal-shots')
const LOG_FILE = path.join(OUT_DIR, 'verify-ssh-terminal-switch.log')

function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`
  fs.appendFileSync(LOG_FILE, line + '\n')
  console.log(line)
}

function startSshServer(hostKey) {
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === 'scx' && ctx.password === 'scxpass') {
        ctx.accept()
        return
      }
      ctx.reject(['password'])
    })
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept()
        session.on('pty', (a) => a && a())
        session.on('shell', (a) => {
          const stream = a()
          stream.write('Welcome to mock SSH server\r\n')
          let line = ''
          stream.on('data', (d) => {
            for (const ch of d.toString()) {
              if (ch === '\r' || ch === '\n') {
                const cmd = line.trim()
                line = ''
                if (cmd) stream.write(`${cmd}: executed\r\n`)
                stream.write('$ ')
              } else {
                line += ch
              }
            }
          })
          stream.write('$ ')
        })
      })
    })
    client.on('error', () => {})
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

async function toggleTerminalMode(page) {
  // 先把鼠标移开，否则停在同一按钮上不会再触发 mouseenter，菜单打不开
  await page.mouse.move(600, 400)
  await page.waitForTimeout(300)
  await page.locator('.menu-btn').filter({ hasText: '视图' }).first().hover()
  await page.waitForTimeout(500)
  await page.locator('.menu-btn').filter({ hasText: '视图' }).first().click()
  await page.waitForTimeout(1200)
  await page.locator('.dropdown-menu .checkbox-item').filter({ hasText: '终端模式' }).first().click()
  await page.waitForTimeout(1500)
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(LOG_FILE, '')

  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
  })
  const { server, port } = await startSshServer(privateKey)
  log(`mock SSH server listening on 127.0.0.1:${port}`)

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-sw-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: REPO_ROOT,
    headless: false,
    env: { ...process.env, SCX_USER_DATA_DIR: userDataDir }
  })

  try {
    const page = await app.firstWindow()
    await page.waitForTimeout(4000)

    // ---------- 1. 新建 SSH 连接 ----------
    await page.locator('.sidebar-action-btn, .add-connection-btn').first().click().catch(() => {})
    await page.waitForTimeout(800)
    let dialog = page.locator('.el-dialog').filter({ hasText: 'SSH' }).first()
    if (!(await dialog.isVisible().catch(() => false))) {
      await page.locator('.el-button').filter({ hasText: '新建' }).first().click().catch(() => {})
      await page.waitForTimeout(800)
      dialog = page.locator('.el-dialog').filter({ hasText: 'SSH' }).first()
    }
    await dialog.locator('.el-tabs__item', { hasText: 'SSH' }).first().click()
    await page.waitForTimeout(300)

    const fillByLabel = async (labelText, value) => {
      const item = dialog.locator('.el-form-item').filter({ hasText: labelText }).first()
      const input = item.locator('input').first()
      await input.click()
      await input.fill(value)
    }
    await fillByLabel('连接名称', 'SSH-切换路径')
    await fillByLabel('服务器地址', '127.0.0.1')
    await fillByLabel('端口', String(port))
    await fillByLabel('用户名', 'scx')
    await fillByLabel('密码', 'scxpass')
    await dialog.locator('.el-button').filter({ hasText: '确认保存' }).first().click()
    await page.waitForTimeout(1500)

    // ---------- 2. 连接 ----------
    const card = page.locator('[class*="connection"]').filter({ hasText: 'SSH-切换路径' }).first()
    await card.dblclick()
    await page.waitForTimeout(5000)
    log(`连接后 xterm 实例数=${await page.locator('.xterm-screen').count()}`)

    // ---------- 3. 切到日志模式 ----------
    await toggleTerminalMode(page)
    await page.screenshot({ path: path.join(OUT_DIR, 'sw-1-log-mode.png') })
    log(`切到日志模式后 xterm 实例数=${await page.locator('.xterm-screen').count()} (期望 1，v-show 保留实例)`)

    // ---------- 4. 再切回终端模式（用户路径） ----------
    await toggleTerminalMode(page)
    await page.screenshot({ path: path.join(OUT_DIR, 'sw-2-back-terminal.png') })

    // 诊断：xterm 容器尺寸 / 可见行数
    const diag = await page.evaluate(() => {
      const host = document.querySelector('.terminal-xterm')
      const screen = document.querySelector('.xterm-screen')
      const rows = document.querySelectorAll('.xterm-rows > div')
      return {
        hostExists: !!host,
        hostW: host ? host.clientWidth : -1,
        hostH: host ? host.clientHeight : -1,
        screenW: screen ? screen.clientWidth : -1,
        screenH: screen ? screen.clientHeight : -1,
        rowCount: rows.length,
        rowText: Array.from(rows).slice(0, 6).map((r) => r.textContent || '')
      }
    })
    log(`xterm 容器尺寸 host=${diag.hostW}x${diag.hostH} screen=${diag.screenW}x${diag.screenH} 行数=${diag.rowCount}`)
    log(`前几行内容: ${JSON.stringify(diag.rowText)}`)

    // ---------- 5. 敲命令 ----------
    await page.locator('.xterm-screen').first().click()
    await page.waitForTimeout(500)
    await page.keyboard.type('echo one')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1000)
    await page.keyboard.type('echo two')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(OUT_DIR, 'sw-3-commands.png') })

    const rows2 = await page.locator('.xterm-rows > div').allInnerTexts()
    const i1 = rows2.findIndex((r) => r.includes('echo one: executed'))
    const i2 = rows2.findIndex((r) => r.includes('echo two: executed'))
    log(`切换路径下: "echo one" 行=${i1}, "echo two" 行=${i2}`)
    log(i1 >= 0 && i2 >= 0 ? 'PASS: 回车有效（命令被执行并回显）' : 'FAIL: 回车无效，命令未执行')
    log(i1 >= 0 && i2 >= 0 && i1 !== i2 ? 'PASS: 输出正常换行' : 'FAIL: 输出挤在一行')

    const diag2 = await page.evaluate(() => {
      const screen = document.querySelector('.xterm-screen')
      return { screenH: screen ? screen.clientHeight : -1 }
    })
    log(`敲命令后 screen 高度=${diag2.screenH}`)
  } catch (err) {
    log(`ERROR: ${err && err.stack ? err.stack : err}`)
  } finally {
    await app.close().catch(() => {})
    server.close()
    log('done')
  }
}

main()
