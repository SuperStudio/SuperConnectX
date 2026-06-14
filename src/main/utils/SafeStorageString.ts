import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const PREFIX = 'ENC:'

export const MASKED_PASSWORD = '***MASKED***'

const KEY_FILE = 'scx.key'

export default class SafeStorageString {
  private static instance: SafeStorageString

  private key: Buffer

  private constructor() {
    const keyPath = path.join(app.getPath('userData'), KEY_FILE)
    if (fs.existsSync(keyPath)) {
      const raw = fs.readFileSync(keyPath, 'utf8')
      this.key = Buffer.from(raw, 'hex')
      // 如果文件内容无效（空文件或非 hex），重新生成密钥
      if (this.key.length !== 32) {
        this.key = crypto.randomBytes(32)
        fs.writeFileSync(keyPath, this.key.toString('hex'), { mode: 0o600 })
      }
    } else {
      this.key = crypto.randomBytes(32)
      fs.writeFileSync(keyPath, this.key.toString('hex'), { mode: 0o600 })
    }
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
