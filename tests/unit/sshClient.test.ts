import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { Server, utils } from 'ssh2'
import net from 'net'
import type { AddressInfo } from 'net'
import SshClient from '../../apps/superconnectx/src/main/protocol/SshClient'

/**
 * SshClient 集成测试
 *
 * 用 ssh2 在本地起真实 SSH 服务端（随机空闲端口），验证：
 *   - 密码认证 / 私钥认证都能建立 shell 会话
 *   - 主机指纹：首次连接记录（TOFU），指纹变更拒绝连接
 * 注意：全部在 Node 侧完成，不启动 Electron，便于在 CI 与本地沙箱受限环境下运行。
 */

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
}

function makeHostKey(): string {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
  })
  return privateKey
}

let keyPair: { private: Buffer | string; public: Buffer | string }
let allowedPubSsh: string
let tmpDir: string

beforeAll(() => {
  keyPair = utils.generateKeyPairSync('ed25519')
  allowedPubSsh = utils.parseKey(keyPair.public as any).toString('ssh')
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-sshclient-'))
  fs.writeFileSync(path.join(tmpDir, 'id_ed25519'), keyPair.private)
})

interface Running {
  server: Server
  port: number
  close: () => Promise<void>
}

/** 取一个当前空闲的端口，用于在不同主机密钥间复用同一 host:port 键 */
function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.listen(0, '127.0.0.1', () => {
      const port = (probe.address() as AddressInfo).port
      probe.close(() => resolve(port))
    })
  })
}

function startServer(
  hostKey: string,
  opts: {
    allowPublicKey?: boolean
    port?: number
    /** 记录 shell 通道收到的原始字节，用于校验是否真的原样发送 */
    onShellData?: (chunk: string) => void
    /** 记录服务端收到的窗口尺寸变更（渲染层 resize 的结果） */
    onWindowChange?: (info: { rows: number; cols: number }) => void
    /** 自定义 shell 首条输出（用于模拟远端打印密码提示） */
    greeting?: string
  } = {}
): Promise<Running> {
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === 'scx' && ctx.password === 'scxpass') {
        ctx.accept()
        return
      }
      if (ctx.method === 'publickey' && ctx.username === 'scxkey' && opts.allowPublicKey) {
        let offered
        try {
          offered = utils.parseKey(ctx.key.data)
        } catch {
          ctx.reject(['publickey'])
          return
        }
        offered.toString('ssh') === allowedPubSsh ? ctx.accept() : ctx.reject(['publickey'])
        return
      }
      ctx.reject(['password', 'publickey'])
    })

    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept()
        session.on('pty', (a) => a && a())
        session.on('window-change', (_a, _r, info) => {
          opts.onWindowChange?.({ rows: info.rows, cols: info.cols })
        })
        session.on('shell', (a) => {
          const stream = a()
          stream.write(opts.greeting ?? 'Welcome to mock ssh\r\n')
          let line = ''
          stream.on('data', (d) => {
            // 无论是否为有效命令，先把原始字节交给 recorder，用于验证 raw 语义
            opts.onShellData?.(d.toString())
            for (const ch of d.toString()) {
              if (ch === '\r' || ch === '\n') {
                const cmd = line.trim()
                line = ''
                if (cmd) stream.write(`${cmd}: ok\r\n`)
                stream.write('$ ')
              } else line += ch
            }
          })
        })
      })
    })
    client.on('error', () => {})
  })

  return new Promise((resolve) => {
    server.listen(opts.port ?? 0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port
      resolve({
        server,
        port,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res())
          })
      })
    })
  })
}

function makeClient(dir: string): SshClient {
  return new SshClient(silentLogger, { knownHostsDir: dir })
}

describe('SshClient 认证方式', () => {
  const running: Running[] = []

  afterEach(async () => {
    while (running.length) {
      await running.pop()!.close()
    }
  })

  it('密码认证可建立会话并回显命令结果', async () => {
    const srv = await startServer(makeHostKey())
    running.push(srv)

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-kh-'))
    const client = makeClient(dir)
    const received: string[] = []

    const result = await client.start(
      {
        host: '127.0.0.1',
        port: srv.port,
        username: 'scx',
        password: 'scxpass',
        sessionId: 's-pwd',
        authMethod: 'password'
      } as any,
      (d: any) => received.push(d.data),
      () => {},
      () => {}
    )
    expect(result.success).toBe(true)

    // shell 建立后的数据流向 onData
    await new Promise((r) => setTimeout(r, 300))
    expect(received.join('')).toContain('Welcome to mock ssh')

    const sendResult = await client.send('s-pwd', 'ls', () => {})
    expect(sendResult.success).toBe(true)
    await new Promise((r) => setTimeout(r, 300))
    expect(received.join('')).toContain('ls: ok')

    await client.disconnect('s-pwd')
  })

  it('私钥认证可建立会话（无口令私钥）', async () => {
    const srv = await startServer(makeHostKey(), { allowPublicKey: true })
    running.push(srv)

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-kh-'))
    const client = makeClient(dir)
    const keyPath = path.join(tmpDir, 'id_ed25519')

    const result = await client.start(
      {
        host: '127.0.0.1',
        port: srv.port,
        username: 'scxkey',
        sessionId: 's-key',
        authMethod: 'key',
        privateKeyPath: keyPath
      } as any,
      () => {},
      () => {},
      () => {}
    )
    expect(result.success).toBe(true)
    await client.disconnect('s-key')
  })

  it('私钥认证缺少私钥路径时给出明确错误', async () => {
    const client = makeClient(fs.mkdtempSync(path.join(os.tmpdir(), 'scx-kh-')))
    const result = await client.start(
      { host: '1.2.3.4', port: 22, username: 'u', sessionId: 's-nokey', authMethod: 'key' } as any,
      () => {},
      () => {},
      () => {}
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('私钥文件路径')
  })

  it('私钥文件不存在时给出可读错误', async () => {
    const client = makeClient(fs.mkdtempSync(path.join(os.tmpdir(), 'scx-kh-')))
    const result = await client.start(
      {
        host: '1.2.3.4',
        port: 22,
        username: 'u',
        sessionId: 's-badkey',
        authMethod: 'key',
        privateKeyPath: path.join(tmpDir, 'not-exist-key')
      } as any,
      () => {},
      () => {},
      () => {}
    )
    expect(result.success).toBe(false)
    expect(result.message).toContain('读取私钥文件失败')
  })
})

describe('SshClient 主机密钥指纹校验', () => {
  it('首次连接记录指纹，同一密钥重连放行；更换密钥后拒绝连接', async () => {
    const hostKey1 = makeHostKey()
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-kh-'))
    const khFile = path.join(dir, 'userdata', 'ssh-known-hosts.json')
    // known_hosts 的键是 host:port，必须复用同一端口才能命中同一条记录
    const port = await freePort()

    // 1) 首次连接：成功，并写入 known_hosts
    const srv1 = await startServer(hostKey1, { port })
    const notices: string[] = []
    const info = {
      host: '127.0.0.1',
      port,
      username: 'scx',
      password: 'scxpass',
      sessionId: 's-fp1',
      authMethod: 'password'
    } as any
    const c1 = makeClient(dir)
    const r1 = await c1.start(info, (d: any) => notices.push(d.data), () => {}, () => {})
    expect(r1.success).toBe(true)
    await c1.disconnect('s-fp1')
    await srv1.close()

    const stored = JSON.parse(fs.readFileSync(khFile, 'utf-8'))
    expect(stored.hosts[`127.0.0.1:${port}`]).toBeTruthy()
    expect(stored.hosts[`127.0.0.1:${port}`].fingerprint.startsWith('SHA256:')).toBe(true)
    expect(notices.join('')).toContain('已记录其密钥指纹')

    // 2) 同一密钥、同端口重连：放行，且不再重复提示“首次连接”
    const srv2 = await startServer(hostKey1, { port })
    const notices2: string[] = []
    const c2 = makeClient(dir)
    const r2 = await c2.start(
      { ...info, sessionId: 's-fp2' } as any,
      (d: any) => notices2.push(d.data),
      () => {},
      () => {}
    )
    expect(r2.success).toBe(true)
    expect(notices2.join('')).not.toContain('已记录其密钥指纹')
    await c2.disconnect('s-fp2')
    await srv2.close()

    // 3) 更换主机密钥后同端口重连：应被拒绝并给出明确中文提示
    await new Promise((r) => setTimeout(r, 300))
    const srv3 = await startServer(makeHostKey(), { port })
    const c3 = makeClient(dir)
    const r3 = await c3.start({ ...info, sessionId: 's-fp3' } as any, () => {}, () => {}, () => {})
    expect(r3.success).toBe(false)
    expect(r3.message).toContain('主机密钥指纹校验失败')
    expect(r3.message).toContain('中间人攻击')
    await srv3.close()
  }, 60000)
})

describe('SshClient 终端模式支持（raw 发送 / PTY 尺寸同步）', () => {
  const waitFor = (predicate: () => boolean, timeoutMs = 5000) =>
    new Promise<void>((resolve, reject) => {
      const started = Date.now()
      const timer = setInterval(() => {
        if (predicate()) {
          clearInterval(timer)
          resolve()
        } else if (Date.now() - started > timeoutMs) {
          clearInterval(timer)
          reject(new Error('waitFor timeout'))
        }
      }, 20)
    })

  it('非 raw 发送会追加换行结束命令', async () => {
    const chunks: string[] = []
    const srv = await startServer(makeHostKey(), { onShellData: (c) => chunks.push(c) })
    const client = makeClient(fs.mkdtempSync(path.join(os.tmpdir(), 'scx-raw1-')))
    const r = await client.start(
      { host: '127.0.0.1', port: srv.port, username: 'scx', password: 'scxpass', sessionId: 's-raw1' } as any,
      () => {}, () => {}, () => {}
    )
    expect(r.success).toBe(true)

    await client.send('s-raw1', 'ls', undefined)
    await waitFor(() => chunks.length > 0)

    expect(chunks.join('')).toBe('ls\n')

    await client.disconnect('s-raw1')
    await srv.close()
  }, 30000)

  it('raw 发送原样下发 Ctrl+C（\x03），不追加换行', async () => {
    const chunks: string[] = []
    const srv = await startServer(makeHostKey(), { onShellData: (c) => chunks.push(c) })
    const client = makeClient(fs.mkdtempSync(path.join(os.tmpdir(), 'scx-raw2-')))
    await client.start(
      { host: '127.0.0.1', port: srv.port, username: 'scx', password: 'scxpass', sessionId: 's-raw2' } as any,
      () => {}, () => {}, () => {}
    )

    await client.send('s-raw2', '\x03', undefined, { raw: true })
    await waitFor(() => chunks.length > 0)

    // 关键断言：追加 \n 会让 ^C 变成 "^C + 回车"，服务端收到 \x03\n 即视为缺陷
    expect(chunks.join('')).toBe('\x03')

    await client.disconnect('s-raw2')
    await srv.close()
  }, 30000)

  it('setWindowSize 会把新的行列同步给远端 PTY', async () => {
    const changes: Array<{ rows: number; cols: number }> = []
    const srv = await startServer(makeHostKey(), { onWindowChange: (i) => changes.push(i) })
    const client = makeClient(fs.mkdtempSync(path.join(os.tmpdir(), 'scx-size-')))
    await client.start(
      { host: '127.0.0.1', port: srv.port, username: 'scx', password: 'scxpass', sessionId: 's-size' } as any,
      () => {}, () => {}, () => {}
    )

    const result = await client.setWindowSize('s-size', 40, 120)
    expect(result.success).toBe(true)

    await waitFor(() => changes.length > 0)
    expect(changes[0]).toEqual({ rows: 40, cols: 120 })

    await client.disconnect('s-size')
    await srv.close()
  }, 30000)

  it('未连接的 session 调用 setWindowSize 返回失败而非抛错', async () => {
    const client = makeClient(fs.mkdtempSync(path.join(os.tmpdir(), 'scx-size2-')))
    const result = await client.setWindowSize('nope', 24, 80)
    expect(result.success).toBe(false)
  })

  it('命令自带凭据时，回显与日志只记掩码', async () => {
    const srv = await startServer(makeHostKey())
    const client = makeClient(fs.mkdtempSync(path.join(os.tmpdir(), 'scx-mask1-')))
    await client.start(
      { host: '127.0.0.1', port: srv.port, username: 'scx', password: 'scxpass', sessionId: 's-mask1' } as any,
      () => {}, () => {}, () => {}
    )

    const echoes: string[] = []
    // 明文密码跟在 -p 后：不能落进协议日志
    await client.send('s-mask1', 'mysql -uroot -p123456', (s: string) => echoes.push(s))
    expect(echoes[0]).toBe('***')

    // 普通命令不受影响，保证日志仍可用
    await client.send('s-mask1', 'ls -la', (s: string) => echoes.push(s))
    expect(echoes[1]).toBe('ls -la')

    await client.disconnect('s-mask1')
    await srv.close()
  }, 30000)

  it('远端打印密码提示后，逐字输入的密码不落明文', async () => {
    const received: string[] = []
    const remoteLogs: string[] = []
    const srv = await startServer(makeHostKey(), {
      greeting: '[sudo] password for scx: ',
      onShellData: (c) => received.push(c)
    })
    const client = makeClient(fs.mkdtempSync(path.join(os.tmpdir(), 'scx-mask2-')))
    await client.start(
      { host: '127.0.0.1', port: srv.port, username: 'scx', password: 'scxpass', sessionId: 's-mask2' } as any,
      () => {}, () => {}, (log: string) => remoteLogs.push(log)
    )
    // 等待 processBuffer 刷出 greeting，敏感窗口随之打开
    await waitFor(() => remoteLogs.length > 0)
    expect(remoteLogs.join('')).toContain('[sudo] password for scx: ')
    expect(remoteLogs.join('')).not.toMatch(/(?:SEND|RECV) >>>>>>>>>>/)

    const echoes: string[] = []
    // 终端模式下密码是逐字发送的：内容本身不含任何敏感关键字，只能靠窗口识别
    await client.send('s-mask2', 's', (s: string) => echoes.push(s), { raw: true })
    await client.send('s-mask2', 'ecret', (s: string) => echoes.push(s), { raw: true })

    expect(echoes).toHaveLength(2)
    expect(echoes.every((e) => e === '***')).toBe(true)

    // 关键：脱敏只影响日志，真实字节仍原样发给远端
    await waitFor(() => received.join('') === 'secret')
    expect(received.join('')).toBe('secret')

    await client.disconnect('s-mask2')
    await srv.close()
  }, 30000)

  it('终端模式逐字输入时，密码字符同样不落明文', async () => {
    const srv = await startServer(makeHostKey())
    const client = makeClient(fs.mkdtempSync(path.join(os.tmpdir(), 'scx-mask3-')))
    await client.start(
      { host: '127.0.0.1', port: srv.port, username: 'scx', password: 'scxpass', sessionId: 's-mask3' } as any,
      () => {}, () => {}, () => {}
    )

    const echoes: string[] = []
    // 终端模式下 xterm 是逐字符发送的：单条记录只有一个字符，
    // 必须靠"本行已输入内容"拼接判断，否则密码会被拆散绕过特征匹配
    for (const ch of 'mysql -uroot -pSuperSecret123') {
      await client.send('s-mask3', ch, (s: string) => echoes.push(s), { raw: true })
    }

    expect(echoes.some((e) => e.includes('SuperSecret123'))).toBe(false)
    expect(echoes.some((e) => /-p\S/.test(e))).toBe(false)
    expect(echoes.filter((e) => e === '***').length).toBeGreaterThan(0)

    // 回车结束该行后，后续普通输入恢复明文记录（保证日志仍可读）
    await client.send('s-mask3', '\r', (s: string) => echoes.push(s), { raw: true })
    await client.send('s-mask3', 'ls', (s: string) => echoes.push(s), { raw: true })
    expect(echoes[echoes.length - 1]).toBe('ls')

    await client.disconnect('s-mask3')
    await srv.close()
  }, 30000)
})
