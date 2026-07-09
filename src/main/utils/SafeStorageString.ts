import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getAppDataDir } from './AppDir'

const PREFIX = 'ENC:'

export const MASKED_PASSWORD = '***MASKED***'

const KEY_FILE = 'scx.key'

function loadOrCreateKey(keyDir: string): Buffer {
  const keyPath = path.join(keyDir, KEY_FILE)
  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath, 'utf8')
    const key = Buffer.from(raw, 'hex')
    // 如果文件内容无效（空文件或非 hex），重新生成密钥
    if (key.length === 32) {
      return key
    }
  }
  // 生成新密钥并持久化
  const newKey = crypto.randomBytes(32)
  fs.writeFileSync(keyPath, newKey.toString('hex'), { mode: 0o600 })
  return newKey
}

export default class SafeStorageString {
  private static instance: SafeStorageString

  private key: Buffer

  /**
   * @param key 可注入 32 字节密钥（用于测试）；不传则从 appDataDir/scx.key 加载或生成
   */
  constructor(key?: Buffer) {
    this.key = key ?? loadOrCreateKey(getAppDataDir())
  }

  static getInstance(): SafeStorageString {
    if (!SafeStorageString.instance) {
      SafeStorageString.instance = new SafeStorageString()
    }
    return SafeStorageString.instance
  }

  isEncrypted(stored: string): boolean {
    if (!stored) return false
    return stored.startsWith(PREFIX)
  }

  encrypt(plaintext: string): string {
    if (!plaintext) return plaintext

    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv)
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ])
    const authTag = cipher.getAuthTag()
    const parts = [
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64')
    ]
    return PREFIX + parts.join('.')
  }

  decrypt(stored: string): string {
    if (!stored) return stored

    if (!stored.startsWith(PREFIX)) {
      return stored
    }

    try {
      const parts = stored.slice(PREFIX.length).split('.')
      if (parts.length !== 3) return stored

      const iv = Buffer.from(parts[0], 'base64')
      const authTag = Buffer.from(parts[1], 'base64')
      const ciphertext = Buffer.from(parts[2], 'base64')

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv)
      decipher.setAuthTag(authTag)
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ])
      return decrypted.toString('utf8')
    } catch {
      return stored
    }
  }
}
