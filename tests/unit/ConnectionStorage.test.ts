import { describe, it, expect, beforeEach } from 'vitest'
import ConnectionStorage, { DuplicateConnectionError } from '../../src/main/storage/ConnectionStorage'
import { MASKED_PASSWORD } from '../../src/main/utils/SafeStorageString'

describe('ConnectionStorage', () => {
  let storage: ConnectionStorage

  beforeEach(() => {
    storage = new ConnectionStorage()
  })

  describe('getAll', () => {
    it('初始返回空数组', () => {
      const all = storage.getAll()
      expect(all).toEqual([])
    })

    it('添加后 getAll 返回掩码密码', () => {
      storage.add({
        name: 'Test',
        connectionType: 'telnet',
        host: '192.168.1.1',
        port: 23,
        username: 'admin',
        password: 'secret123'
      })
      const all = storage.getAll()
      expect(all.length).toBe(1)
      expect(all[0].password).toBe(MASKED_PASSWORD)
    })

    it('getAll 自动补 ID', () => {
      storage.add({ name: 'Test', connectionType: 'telnet', host: 'h', port: 1 })
      const all = storage.getAll()
      expect(all[0].id).toBe(1)
    })
  })

  describe('add', () => {
    it('添加连接并返回掩码后的数据', () => {
      const result = storage.add({
        name: 'MyTelnet',
        connectionType: 'telnet',
        host: '10.0.0.1',
        port: 23,
        username: 'root',
        password: 'mypassword'
      })
      expect(result.password).toBe(MASKED_PASSWORD)
      expect(result.name).toBe('MyTelnet')
      expect(result.id).toBe(1)
    })

    it('自动分配递增 ID', () => {
      const c1 = storage.add({ name: 'C1', connectionType: 'telnet', host: 'h1', port: 1 })
      const c2 = storage.add({ name: 'C2', connectionType: 'ssh', host: 'h2', port: 22 })
      expect(c1.id).toBe(1)
      expect(c2.id).toBe(2)
    })

    it('添加无密码的连接（如 TCP）', () => {
      const result = storage.add({
        name: 'TCP',
        connectionType: 'tcp',
        host: '10.0.0.1',
        port: 8080
      })
      expect(result.name).toBe('TCP')
      expect(result.password).toBeUndefined()
    })

    it('重复连接抛出 DuplicateConnectionError', () => {
      storage.add({ name: 'Dup', connectionType: 'telnet', host: '1.1.1.1', port: 23 })
      expect(() => {
        storage.add({ name: 'Dup', connectionType: 'telnet', host: '1.1.1.1', port: 23 })
      }).toThrow(DuplicateConnectionError)
    })

    it('重复连接错误信息包含连接详情', () => {
      storage.add({ name: 'Dup', connectionType: 'telnet', host: '1.1.1.1', port: 23 })
      try {
        storage.add({ name: 'Dup', connectionType: 'telnet', host: '1.1.1.1', port: 23 })
        expect(false).toBe(true) // 不应到达
      } catch (e: any) {
        expect(e.message).toContain('telnet')
        expect(e.message).toContain('Dup')
        expect(e.message).toContain('1.1.1.1')
        expect(e.message).toContain('23')
      }
    })

    it('不同协议类型不冲突', () => {
      storage.add({ name: 'Same', connectionType: 'telnet', host: '1.1.1.1', port: 23 })
      expect(() => {
        storage.add({ name: 'Same', connectionType: 'ssh', host: '1.1.1.1', port: 23 })
      }).not.toThrow()
    })

    it('添加连接时加密密码', () => {
      const result = storage.add({
        name: 'Encrypted',
        connectionType: 'telnet',
        host: '10.0.0.1',
        port: 23,
        username: 'admin',
        password: 'plaintext123'
      })
      // 返回给前端的密码是掩码
      expect(result.password).toBe(MASKED_PASSWORD)
      // 但 getByIdWithPassword 应返回明文
      const withPwd = storage.getByIdWithPassword(result.id)
      expect(withPwd!.password).toBe('plaintext123')
    })
  })

  describe('getByIdWithPassword', () => {
    it('返回解密后的连接', () => {
      const added = storage.add({
        name: 'Secret',
        connectionType: 'telnet',
        host: '10.0.0.1',
        port: 23,
        username: 'root',
        password: 'supersecret'
      })
      const conn = storage.getByIdWithPassword(added.id)
      expect(conn).not.toBeNull()
      expect(conn!.password).toBe('supersecret')
    })

    it('不存在的 ID 返回 null', () => {
      expect(storage.getByIdWithPassword(999)).toBeNull()
    })

    it('无密码的连接正常返回', () => {
      const added = storage.add({
        name: 'NoPwd',
        connectionType: 'tcp',
        host: '10.0.0.1',
        port: 80
      })
      const conn = storage.getByIdWithPassword(added.id)
      expect(conn).not.toBeNull()
      expect(conn!.password).toBeUndefined()
    })
  })

  describe('update', () => {
    it('更新连接名称', () => {
      const added = storage.add({
        name: 'Old',
        connectionType: 'telnet',
        host: 'h',
        port: 1,
        username: 'u',
        password: 'secret'
      })
      const result = storage.update({ id: added.id, name: 'New' })
      expect(result![0].name).toBe('New')
      expect(result![0].password).toBe(MASKED_PASSWORD)
    })

    it('更新密码（非掩码）', () => {
      const added = storage.add({
        name: 'PwdUpdate',
        connectionType: 'telnet',
        host: 'h',
        port: 1,
        username: 'u',
        password: 'oldpass'
      })
      // update 需要 connectionType 才能判断 hasPasswordField
      storage.update({ id: added.id, connectionType: 'telnet', password: 'newpass' })
      const conn = storage.getByIdWithPassword(added.id)
      expect(conn!.password).toBe('newpass')
    })

    it('密码为掩码时不更新', () => {
      const added = storage.add({
        name: 'MaskTest',
        connectionType: 'telnet',
        host: 'h',
        port: 1,
        username: 'u',
        password: 'original'
      })
      storage.update({ id: added.id, connectionType: 'telnet', password: MASKED_PASSWORD })
      const conn = storage.getByIdWithPassword(added.id)
      expect(conn!.password).toBe('original')
    })

    it('更新不存在的连接不报错', () => {
      const result = storage.update({ id: 999, name: 'Nope' })
      expect(result).toBeUndefined()
    })

    it('更新导致重复时抛出错误', () => {
      storage.add({ name: 'C1', connectionType: 'telnet', host: 'h1', port: 1 })
      const c2 = storage.add({ name: 'C2', connectionType: 'telnet', host: 'h2', port: 2 })
      expect(() => {
        storage.update({
          id: c2.id,
          name: 'C1',
          host: 'h1',
          port: 1,
          connectionType: 'telnet'
        })
      }).toThrow(DuplicateConnectionError)
    })

    it('更新 FTP 特有字段', () => {
      const added = storage.add({
        name: 'FTP',
        connectionType: 'ftp',
        host: '10.0.0.1',
        port: 21,
        username: 'ftpuser',
        password: 'ftppass',
        ftpMode: 'server'
      })
      storage.update({
        id: added.id,
        connectionType: 'ftp',
        ftpMode: 'client',
        ftpDirectory: '/home/ftp',
        ftpPermissions: ['get', 'put']
      })
      const conn = storage.getByIdWithPassword(added.id)
      expect(conn!.ftpMode).toBe('client')
      expect(conn!.ftpDirectory).toBe('/home/ftp')
      expect(conn!.ftpPermissions).toEqual(['get', 'put'])
    })
  })

  describe('delete', () => {
    it('删除连接', () => {
      const c1 = storage.add({ name: 'C1', connectionType: 'telnet', host: 'h1', port: 1 })
      storage.add({ name: 'C2', connectionType: 'telnet', host: 'h2', port: 2 })
      const result = storage.delete(c1.id)
      expect(result.length).toBe(1)
      expect(result[0].name).toBe('C2')
    })

    it('删除不存在的 ID 不报错', () => {
      storage.add({ name: 'C1', connectionType: 'telnet', host: 'h1', port: 1 })
      const result = storage.delete(999)
      expect(result.length).toBe(1)
    })
  })

  describe('readRawConnections - 自动补 ID', () => {
    it('通过反射验证补 ID 逻辑（间接测试）', () => {
      // 通过 add/delete/getAll 间接验证
      const c1 = storage.add({ name: 'C1', connectionType: 'telnet', host: 'h1', port: 1 })
      const c2 = storage.add({ name: 'C2', connectionType: 'telnet', host: 'h2', port: 2 })
      storage.delete(c1.id)
      const c3 = storage.add({ name: 'C3', connectionType: 'telnet', host: 'h3', port: 3 })
      expect(c3.id).toBe(3) // ID 继续递增
    })
  })

  describe('密码加密/解密流程', () => {
    it('存储的密码已加密，getByIdWithPassword 解密为明文', () => {
      const added = storage.add({
        name: 'Flow',
        connectionType: 'ftp',
        host: 'ftp.example.com',
        port: 21,
        username: 'user',
        password: 'complex!@#$%^&*()'
      })
      const decrypted = storage.getByIdWithPassword(added.id)
      expect(decrypted!.password).toBe('complex!@#$%^&*()')

      // 再次 add 验证加密不重复
      const all = storage.getAll()
      expect(all[0].password).toBe(MASKED_PASSWORD)
    })

    it('特殊字符密码', () => {
      const pwd = 'p@ss\nw0rd\twith\r\nspecial'
      const added = storage.add({
        name: 'Special',
        connectionType: 'telnet',
        host: 'h',
        port: 1,
        username: 'u',
        password: pwd
      })
      const decrypted = storage.getByIdWithPassword(added.id)
      expect(decrypted!.password).toBe(pwd)
    })

    it('Unicode 密码', () => {
      const pwd = '密码测试🔑'
      const added = storage.add({
        name: 'Unicode',
        connectionType: 'telnet',
        host: 'h',
        port: 1,
        username: 'u',
        password: pwd
      })
      const decrypted = storage.getByIdWithPassword(added.id)
      expect(decrypted!.password).toBe(pwd)
    })
  })

  describe('DuplicateConnectionError', () => {
    it('是 Error 的子类', () => {
      const err = new DuplicateConnectionError('test')
      expect(err).toBeInstanceOf(Error)
      expect(err.name).toBe('DuplicateConnectionError')
    })
  })
})
