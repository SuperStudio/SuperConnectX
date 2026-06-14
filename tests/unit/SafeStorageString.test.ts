import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import SafeStorageString, { MASKED_PASSWORD } from '../../src/main/utils/SafeStorageString'

describe('SafeStorageString', () => {
  // 生成固定的 32 字节密钥，避免依赖 electron 的 userData 路径
  const testKey = crypto.randomBytes(32)
  const sss = new SafeStorageString(testKey)

  describe('isEncrypted', () => {
    it('空字符串返回 false', () => {
      expect(sss.isEncrypted('')).toBe(false)
    })

    it('非 ENC: 前缀的字符串返回 false', () => {
      expect(sss.isEncrypted('hello world')).toBe(false)
    })

    it('ENC: 前缀的字符串返回 true', () => {
      expect(sss.isEncrypted('ENC:some-data')).toBe(true)
    })
  })

  describe('encrypt / decrypt', () => {
    it('加密后解密得到原文', () => {
      const plaintext = 'mySecretPassword123'
      const encrypted = sss.encrypt(plaintext)
      const decrypted = sss.decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it('加密后的字符串以 ENC: 开头', () => {
      const encrypted = sss.encrypt('test')
      expect(encrypted.startsWith('ENC:')).toBe(true)
    })

    it('空字符串加密解密后仍为空字符串', () => {
      expect(sss.encrypt('')).toBe('')
      expect(sss.decrypt('')).toBe('')
    })

    it('每次加密同一明文产生不同密文（随机 IV）', () => {
      const plaintext = 'password123'
      const enc1 = sss.encrypt(plaintext)
      const enc2 = sss.encrypt(plaintext)
      expect(enc1).not.toBe(enc2)
    })

    it('解密非 ENC: 前缀的内容直接原样返回（兼容明文）', () => {
      expect(sss.decrypt('plaintext-password')).toBe('plaintext-password')
    })

    it('解密格式错误的内容原样返回（不抛异常）', () => {
      expect(sss.decrypt('ENC:bad-format')).toBe('ENC:bad-format')
    })

    it('不同密钥加密的密文无法互相解密', () => {
      const otherKey = crypto.randomBytes(32)
      const other = new SafeStorageString(otherKey)
      const encrypted = sss.encrypt('secret')
      const decrypted = other.decrypt(encrypted)
      expect(decrypted).not.toBe('secret')
    })
  })

  describe('MASKED_PASSWORD', () => {
    it('MASKED_PASSWORD 常量正确', () => {
      expect(MASKED_PASSWORD).toBe('***MASKED***')
    })

    it('掩码检测：isEncrypted 对掩码返回 false', () => {
      expect(sss.isEncrypted(MASKED_PASSWORD)).toBe(false)
    })
  })
})
