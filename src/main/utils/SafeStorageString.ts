import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { safeStorage } from 'electron'
import { getAppDataDir } from './AppDir'

/**
 * PREFIX_OS: 由操作系统密钥链（safeStorage）加密的密文前缀
 * PREFIX_APP: 由应用自身 AES-256-GCM 加密的密文前缀（Linux fallback）
 */
const PREFIX_OS = 'OS:'
const PREFIX_APP = 'ENC:'

export const MASKED_PASSWORD = '***MASKED***'

const KEY_FILE = 'scx.key'

function loadOrCreateKey(keyDir: string): Buffer {
  const keyPath = path.join(keyDir, KEY_FILE)
  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath, 'utf8')
    const key = Buffer.from(raw, 'hex')
    if (key.length === 32) {
      return key
    }
  }
  const newKey = crypto.randomBytes(32)
  fs.writeFileSync(keyPath, newKey.toString('hex'), { mode: 0o600 })
  return newKey
}

export default class SafeStorageString {
  private static instance: SafeStorageString

  /** 应用自身 AES-256-GCM 密钥（仅 fallback 时使用） */
  private appKey: Buffer | null = null

  /**
   * 加密后端：null 表示尚未检测，true 为 OS 密钥链，false 为 APP 加密
   * 延迟检测：首次实际加密/解密时才调用 safeStorage.isEncryptionAvailable()
   * 因为 Windows 上 safeStorage 需要 app.ready 之后才可用。
   */
  private _useOsKeychain: boolean | null = null

  /**
   * @param key 可注入 32 字节密钥（用于测试）；注入时强制使用 APP 加密模式
   */
  constructor(key?: Buffer) {
    if (key) {
      this.appKey = key
      this._useOsKeychain = false
    }
  }

  static getInstance(): SafeStorageString {
    if (!SafeStorageString.instance) {
      SafeStorageString.instance = new SafeStorageString()
    }
    return SafeStorageString.instance
  }

  /**
   * 检测加密后端（延迟初始化，首次调用时检测）
   */
  private detectBackend(): void {
    if (this._useOsKeychain !== null) return // 已检测过

    if (safeStorage.isEncryptionAvailable()) {
      this._useOsKeychain = true
    } else {
      this._useOsKeychain = false
      this.appKey = loadOrCreateKey(getAppDataDir())
    }
  }

  /**
   * 当前是否使用操作系统密钥链
   */
  isUsingOsKeychain(): boolean {
    this.detectBackend()
    return this._useOsKeychain === true
  }

  isEncrypted(stored: string): boolean {
    if (!stored) return false
    return stored.startsWith(PREFIX_OS) || stored.startsWith(PREFIX_APP)
  }

  encrypt(plaintext: string): string {
    if (!plaintext) return plaintext

    this.detectBackend()

    if (this._useOsKeychain) {
      const encrypted = safeStorage.encryptString(plaintext)
      return PREFIX_OS + encrypted.toString('base64')
    }

    // 回退：AES-256-GCM
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.appKey!, iv)
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
    return PREFIX_APP + parts.join('.')
  }

  decrypt(stored: string): string {
    if (!stored) return stored

    this.detectBackend()

    if (stored.startsWith(PREFIX_OS)) {
      if (!this._useOsKeychain) {
        // 密钥链不可用但数据是 OS 加密的（不应发生，兜底返回原值）
        return stored
      }
      try {
        const encrypted = Buffer.from(stored.slice(PREFIX_OS.length), 'base64')
        return safeStorage.decryptString(encrypted)
      } catch {
        return stored
      }
    }

    if (stored.startsWith(PREFIX_APP)) {
      if (!this.appKey) return stored
      try {
        const parts = stored.slice(PREFIX_APP.length).split('.')
        if (parts.length !== 3) return stored

        const iv = Buffer.from(parts[0], 'base64')
        const authTag = Buffer.from(parts[1], 'base64')
        const ciphertext = Buffer.from(parts[2], 'base64')

        const decipher = crypto.createDecipheriv('aes-256-gcm', this.appKey, iv)
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

    // 无前缀的明文，直接返回
    return stored
  }
}
