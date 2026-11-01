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
  opts: { allowPublicKey?: boolean; port?: number } = {}
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
        session.on('shell', (a) => {
          const stream = a()
          stream.write('Welcome to mock ssh\r\n')
          let line = ''
          stream.on('data', (d) => {
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
