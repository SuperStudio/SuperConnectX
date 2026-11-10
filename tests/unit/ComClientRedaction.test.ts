/**
 * ComClient 智能脱敏测试（PR #330 意见 1）
 * 覆盖：凭据特征、行缓冲累积、密码窗口（有/无换行）、窗口过期、HEX 载荷、清理
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('serialport', () => ({
  SerialPort: class {
    on() {}
    once() {}
    removeAllListeners() {}
    open() {}
    write() {}
    close() {}
  }
}))

import ComClient from '@/main/protocol/ComClient'
import { BufferLineSplitter } from '@/main/protocol/BufferLineSplitter'

function makeClient(encoding = 'utf8') {
  const logger = { info: () => {}, error: () => {}, warn: () => {} } as any
  const client = new ComClient(logger)
  const written: Buffer[] = []
  ;(client as any).serialConnections.set('s1', {
    port: {
      isOpen: true,
      close: (cb: any) => cb(null),
      write: (data: any, enc: any, cb: any) => {
        written.push(Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(data, enc))
        cb(null)
      }
    },
    buffer: Buffer.alloc(0),
    timer: null,
    flushTimer: null,
    lastDataTime: 0,
    pendingSince: 0,
    packetTimeout: 0,
    writeTimeout: 0,
    encoding,
    onData: null,
    onClose: null,
    onLog: null,
    receiveHex: false,
    terminalMode: false,
    sessionId: 's1',
    splitter: new BufferLineSplitter(encoding, false)
  })
  return { client, written }
}

describe('ComClient 智能脱敏', () => {
  it('凭据特征（--password=）→ 掩码', async () => {
    const { client } = makeClient()
    const logged: string[] = []
    await (client as any).send('s1', '--password=abc', (s: string) => logged.push(s), { source: 'text' })
    expect(logged[0]).toContain('***')
    expect(logged[0]).not.toContain('abc')
  })

  it('行缓冲累积逐字输入（mysql -p123）→ 掩码', async () => {
    const { client } = makeClient()
    const logged: string[] = []
    for (const ch of 'mysql -p123') {
      await (client as any).send('s1', ch, (s: string) => logged.push(s), { raw: true, source: 'text' })
    }
    expect(logged.join('|')).toContain('***')
  })

  it('密码窗口：有换行提示（processBuffer）→ 开窗 → 窗口内掩码', async () => {
    const { client } = makeClient()
    const conn = (client as any).serialConnections.get('s1')
    conn.buffer = Buffer.from('Password: \n', 'utf8')
    ;(client as any).processBuffer(conn)
    expect((client as any).sensitiveWindowUntil.has('s1')).toBe(true)

    const logged: string[] = []
    await (client as any).send('s1', 'secret', (s: string) => logged.push(s), { raw: true, source: 'text' })
    expect(logged[0]).toContain('***')
    expect(logged[0]).not.toContain('secret')
  })

  it('无换行密码提示（flushCompletePrefix 路径）→ 开窗', () => {
    const { client } = makeClient()
    const conn = (client as any).serialConnections.get('s1')
    conn.buffer = Buffer.from('Password: ', 'utf8') // 无换行，走 flush 路径
    ;(client as any).flushCompletePrefix(conn, 'test')
    expect((client as any).sensitiveWindowUntil.has('s1')).toBe(true)
  })

  it('窗口过期后不再掩码', async () => {
    const { client } = makeClient()
    ;(client as any).sensitiveWindowUntil.set('s1', Date.now() - 1000)
    const logged: string[] = []
    await (client as any).send('s1', 'plain', (s: string) => logged.push(s), { raw: true, source: 'text' })
    expect(logged[0]).toContain('plain')
    expect((client as any).sensitiveWindowUntil.has('s1')).toBe(false)
  })

  it('HEX 载荷走二进制分支且不进行缓冲', async () => {
    const { client, written } = makeClient()
    await (client as any).send('s1', '\xe9\x80', () => {}, { source: 'hex' })
    expect(Array.from(written[0])).toEqual([0xe9, 0x80])
    expect((client as any).inputLineBuffer.get('s1') ?? '').toBe('')
  })

  it('disconnect 清理敏感窗口与行缓冲', async () => {
    const { client } = makeClient()
    ;(client as any).sensitiveWindowUntil.set('s1', Date.now() + 60000)
    ;(client as any).inputLineBuffer.set('s1', 'abc')
    await client.disconnect('s1')
    expect((client as any).sensitiveWindowUntil.has('s1')).toBe(false)
    expect((client as any).inputLineBuffer.has('s1')).toBe(false)
  })
})
