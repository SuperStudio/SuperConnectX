import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import SshKnownHostsStorage from '../../apps/superconnectx/src/main/storage/SshKnownHostsStorage'
import SshClient from '../../apps/superconnectx/src/main/protocol/SshClient'

describe('SshKnownHostsStorage', () => {
  let tmpDir: string
  let storage: SshKnownHostsStorage

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-knownhosts-'))
    storage = new SshKnownHostsStorage(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('首次查询返回 null（未记录）', () => {
    expect(storage.getFingerprint('1.2.3.4', 22)).toBeNull()
  })

  it('trust 后可查询到指纹，且持久化到文件', () => {
    storage.trust('1.2.3.4', 22, 'SHA256:abc')
    expect(storage.getFingerprint('1.2.3.4', 22)).toBe('SHA256:abc')

    // 新实例应能读到同一份数据（持久化验证）
    const again = new SshKnownHostsStorage(tmpDir)
    expect(again.getFingerprint('1.2.3.4', 22)).toBe('SHA256:abc')
  })

  it('buildKey 对空端口默认 22', () => {
    expect(SshKnownHostsStorage.buildKey('host')).toBe('host:22')
    expect(SshKnownHostsStorage.buildKey('host', 2222)).toBe('host:2222')
  })

  it('不同 host:port 相互隔离', () => {
    storage.trust('1.2.3.4', 22, 'SHA256:a')
    storage.trust('1.2.3.4', 2222, 'SHA256:b')
    expect(storage.getFingerprint('1.2.3.4', 22)).toBe('SHA256:a')
    expect(storage.getFingerprint('1.2.3.4', 2222)).toBe('SHA256:b')
  })

  it('remove 删除后重新回到未记录状态', () => {
    storage.trust('5.6.7.8', 22, 'SHA256:x')
    storage.remove('5.6.7.8', 22)
    expect(storage.getFingerprint('5.6.7.8', 22)).toBeNull()
  })

  it('文件损坏时返回空而不是抛错（不阻断连接）', () => {
    const file = path.join(tmpDir, 'userdata', 'ssh-known-hosts.json')
    fs.writeFileSync(file, '{ broken json !!!', 'utf-8')
    expect(storage.getFingerprint('9.9.9.9', 22)).toBeNull()
  })

  it('数据写入 userdata 子目录', () => {
    storage.trust('10.0.0.1', 22, 'SHA256:dir')
    const file = path.join(tmpDir, 'userdata', 'ssh-known-hosts.json')
    expect(fs.existsSync(file)).toBe(true)
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
    expect(raw.hosts['10.0.0.1:22'].fingerprint).toBe('SHA256:dir')
  })
})

describe('SshClient.computeFingerprint', () => {
  it('对相同输入产出稳定指纹，格式为 SHA256:base64 且无 = 填充', () => {
    const key = Buffer.from('fake-host-key-bytes')
    const fp1 = SshClient.computeFingerprint(key)
    const fp2 = SshClient.computeFingerprint(key)
    expect(fp1).toBe(fp2)
    expect(fp1.startsWith('SHA256:')).toBe(true)
    expect(fp1.includes('=')).toBe(false)
    // base64 部分可解码回原始哈希
    const b64 = fp1.slice('SHA256:'.length)
    const hash = Buffer.from(b64, 'base64')
    expect(hash.length).toBe(32) // sha256 = 32 bytes
  })

  it('不同输入产出不同指纹', () => {
    const a = SshClient.computeFingerprint(Buffer.from('host-key-A'))
    const b = SshClient.computeFingerprint(Buffer.from('host-key-B'))
    expect(a).not.toBe(b)
  })
})
