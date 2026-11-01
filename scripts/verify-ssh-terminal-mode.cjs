/**
 * SSH 终端模式实测脚本（回归验证用，长期保留）
 *
 * 前置：先执行 electron-vite build 生成 out/ 产物（启动的是打包后的主进程入口）
 * 用法：node scripts/verify-ssh-terminal-mode.cjs
 * 注意：shell 若注入了 ELECTRON_RUN_AS_NODE=1 需先清除，否则 electron 以纯 Node 模式启动
 *
 * 场景：
 *   1. 起本地 mock SSH 服务
 *   2. 新建 SSH 连接并连接 -> 应默认进入终端模式（xterm），命令输入栏隐藏
 *   3. 在 xterm 里敲命令 -> 应正常回显
 *   4. 按 Ctrl+C -> 应能打断正在运行的命令
 *   5. 视图菜单 -> 终端模式勾选状态应与当前连接一致，取消勾选后回到日志视图
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
const { _electron: electron } = require('playwright')
const { Server } = require('ssh2')

const REPO_ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(REPO_ROOT, 'tests', 'report', 'terminal-shots')
const LOG_FILE = path.join(OUT_DIR, 'verify-ssh-terminal-mode.log')

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
          let beeping = false
          const beepTimer = setInterval(() => {
            if (beeping) stream.write('running...\r\n')
          }, 400)
          stream.on('data', (d) => {
            for (const ch of d.toString()) {
              if (ch === '\x03') {
                // Ctrl+C：停止后台输出，打印 ^C
                beeping = false
                line = ''
                stream.write('^C\r\n')
                stream.write('$ ')
                continue
              }
              if (ch === '\r' || ch === '\n') {
                const cmd = line.trim()
                line = ''
                if (cmd === 'yes-beep') {
                  beeping = true
                  stream.write('started background loop, press Ctrl+C to stop\r\n')
                } else if (cmd) {
                  stream.write(`${cmd}: executed\r\n`)
                }
                stream.write('$ ')
              } else {
                line += ch
              }
            }
          })
          stream.on('close', () => clearInterval(beepTimer))
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

/** 本轮在终端里敲入的敏感串，供退出后校验日志是否泄漏 */
let TYPED_SECRET = ''

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(LOG_FILE, '')

  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
  })
  const { server, port } = await startSshServer(privateKey)
  log(`mock SSH server listening on 127.0.0.1:${port}`)

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-tm-'))
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
      // 备用入口：右键侧边栏或工具栏按钮
      await page.locator('.el-button').filter({ hasText: '新建' }).first().click().catch(() => {})
      await page.waitForTimeout(800)
      dialog = page.locator('.el-dialog').filter({ hasText: 'SSH' }).first()
    }

    await dialog.locator('.el-tabs__item', { hasText: 'SSH' }).first().click()
    await page.waitForTimeout(300)

    const inputs = dialog.locator('.el-form-item')
    const fillByLabel = async (labelText, value) => {
      const item = dialog.locator('.el-form-item').filter({ hasText: labelText }).first()
      const input = item.locator('input').first()
      await input.click()
      await input.fill(value)
    }
    await fillByLabel('连接名称', 'SSH-终端模式')
    await fillByLabel('服务器地址', '127.0.0.1')
    await fillByLabel('端口', String(port))
    await fillByLabel('用户名', 'scx')
    await fillByLabel('密码', 'scxpass')
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, 'tm-1-dialog.png') })
    log('SSH 连接表单已填写')

    await dialog.locator('.el-button').filter({ hasText: '确认保存' }).first().click()
    await page.waitForTimeout(1500)

    // ---------- 2. 连接：双击侧边栏卡片 ----------
    let card = page.locator('.connection-item, .conn-item, .connection-card').filter({ hasText: 'SSH-终端模式' }).first()
    if (!(await card.count())) {
      card = page.locator('[class*="connection"]').filter({ hasText: 'SSH-终端模式' }).first()
    }
    await card.dblclick()
    log('已发起连接')
    await page.waitForTimeout(5000)
    await page.screenshot({ path: path.join(OUT_DIR, 'tm-2-connected.png') })

    // ---------- 3. 校验：SSH 默认应为终端模式 ----------
    const xtermCount = await page.locator('.xterm-screen').count()
    const inputVisible = await page.locator('.command-input').first().isVisible().catch(() => false)
    log(`xterm 实例数=${xtermCount}  命令输入栏可见=${inputVisible}`)

    if (xtermCount > 0) {
      // ---------- 4. 在终端里执行命令 ----------
      await page.locator('.xterm-screen').first().click()
      await page.waitForTimeout(300)
      await page.keyboard.type('echo hello-superx')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1200)
      await page.keyboard.type('ls -la')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1200)
      await page.screenshot({ path: path.join(OUT_DIR, 'tm-3-commands.png') })
      let termText = await page.locator('.xterm-rows').first().innerText().catch(() => '')
      log(`命令回显包含 hello-superx: ${termText.includes('hello-superx')}`)

      // ---------- 5. Ctrl+C 打断 ----------
      await page.keyboard.type('yes-beep')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1400)
      await page.screenshot({ path: path.join(OUT_DIR, 'tm-4-before-ctrlc.png') })
      await page.keyboard.press('Control+c')
      await page.waitForTimeout(1600)
      await page.screenshot({ path: path.join(OUT_DIR, 'tm-5-after-ctrlc.png') })
      termText = await page.locator('.xterm-rows').first().innerText().catch(() => '')
      log(`Ctrl+C 出现 ^C: ${termText.includes('^C')}`)

      // ---------- 5.5 敏感命令不得明文落盘 ----------
      // 协议日志会把 SEND 内容原样写盘，终端模式下每个按键都走同一链路，
      // 因此 mysql -p<密码> 这类输入必须被脱敏（详见 utils/SensitiveInput）
      // 只负责输入：日志有缓冲区，需等应用退出 flush 后再校验（见脚本末尾）
      TYPED_SECRET = 'superx-secret-9527'
      await page.keyboard.type(`mysql -uroot -p${TYPED_SECRET}`)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1500)
    }

    // ---------- 6. 视图菜单：勾选态应反映当前连接 ----------
    await page.locator('.menu-btn').filter({ hasText: '视图' }).first().click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(OUT_DIR, 'tm-6-view-menu.png') })
    const checkMark = await page.locator('.dropdown-menu .checkbox-item').filter({ hasText: '终端模式' }).first().locator('.checkbox-mark').innerText().catch(() => '')
    log(`视图菜单中「终端模式」勾选标记 = "${checkMark.trim()}" (期望 ✓)`)

    // ---------- 7. 取消勾选 -> 回到日志视图 ----------
    await page.locator('.dropdown-menu .checkbox-item').filter({ hasText: '终端模式' }).first().click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(OUT_DIR, 'tm-7-log-mode.png') })
    const inputVisibleAfter = await page.locator('.command-input').first().isVisible().catch(() => false)
    log(`取消终端模式后 命令输入栏可见=${inputVisibleAfter} (期望 true)`)

    // ---------- 8. 再次勾选 -> 回到终端模式 ----------
    await page.locator('.menu-btn').filter({ hasText: '视图' }).first().click()
    await page.waitForTimeout(500)
    await page.locator('.dropdown-menu .checkbox-item').filter({ hasText: '终端模式' }).first().click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(OUT_DIR, 'tm-8-back-to-terminal.png') })
    const xtermBack = await page.locator('.xterm-screen').count()
    log(`再次进入终端模式 xterm 实例数=${xtermBack}`)
  } catch (err) {
    log(`ERROR: ${err && err.stack ? err.stack : err}`)
  } finally {
    await app.close().catch(() => {})
    server.close()

    // ---------- 9. 敏感命令脱敏校验（应用退出后日志已 flush） ----------
    if (TYPED_SECRET) {
      const logDir = path.join(userDataDir, 'logs')
      let leaked = false
      let masked = false
      let scanned = 0
      if (fs.existsSync(logDir)) {
        for (const f of fs.readdirSync(logDir)) {
          if (!f.endsWith('.log')) continue
          scanned++
          const txt = fs.readFileSync(path.join(logDir, f), 'utf8').replace(/\0/g, '')
          // 只看发送记录：远端回显（shell 会回显命令行）不在本应用可控范围内
          for (const line of txt.split('\n')) {
            if (!line.includes('SEND >>>>>>>>>> ')) continue
            const payload = line.split('SEND >>>>>>>>>> ')[1] || ''
            if (payload.includes(TYPED_SECRET)) leaked = true
            if (payload.trim() === '***') masked = true
          }
        }
      }
      log(
        `敏感命令脱敏: 扫描日志 ${scanned} 个 | SEND 出现掩码=${masked} | SEND 明文泄漏=${leaked}` +
          ` (期望 masked=true, leaked=false)`
      )
    }
    log('done')
  }
}

main()
