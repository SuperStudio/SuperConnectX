import { describe, it, expect } from 'vitest'
import {
  SENSITIVE_MASK,
  looksLikeCredential,
  looksLikePasswordPrompt,
  maskSensitiveInput
} from '../../apps/superconnectx/src/main/utils/SensitiveInput'

/**
 * 敏感输入脱敏：防止用户密码随协议日志明文落盘
 */
describe('SensitiveInput 命令凭据识别', () => {
  it('识别常见的明文凭据形式', () => {
    const samples = [
      'mysql -uroot -p123456',
      'mysqldump -u root -pSecret db',
      'sshpass -p mypass ssh root@1.2.3.4',
      'curl -u admin:admin123 http://x/api',
      'python a.py --password=abc123',
      'export PGPASSWORD=abc123',
      'sudo -S apt update',
      'passwd root'
    ]
    for (const s of samples) {
      expect(looksLikeCredential(s), s).toBe(true)
    }
  })

  it('不误伤普通命令（尤其 mkdir -p 这类带 -p 的）', () => {
    const samples = [
      'ls -la',
      'mkdir -p /data/logs',
      'cd /var/log && tail -f app.log',
      'top -n 1',
      'echo hello',
      'ps -ef | grep nginx',
      'git log --oneline -p' // -p 后无内容，不算密码
    ]
    for (const s of samples) {
      expect(looksLikeCredential(s), s).toBe(false)
    }
  })

  it('命中时整体替换为掩码，未命中原样返回', () => {
    expect(maskSensitiveInput('mysql -uroot -p123456')).toBe(SENSITIVE_MASK)
    expect(maskSensitiveInput('ls -la')).toBe('ls -la')
    expect(maskSensitiveInput('')).toBe('')
  })
})

describe('SensitiveInput 密码提示识别', () => {
  it('识别远端要求输入密码的提示', () => {
    const samples = [
      '[sudo] password for root: ',
      'Password: ',
      'Enter password: ',
      'password for scx@host: ',
      'Enter passphrase for /root/.ssh/id_rsa: ',
      'Current password: ',
      'New password: ',
      'Retype new password: '
    ]
    for (const s of samples) {
      expect(looksLikePasswordPrompt(s), s).toBe(true)
    }
  })

  it('普通 shell 输出不触发敏感窗口', () => {
    const samples = ['[root@host ~]# ', 'Welcome to mock ssh', 'total 12\ndrwxr-xr-x 2 root root', '$ ']
    for (const s of samples) {
      expect(looksLikePasswordPrompt(s), s).toBe(false)
    }
  })
})
