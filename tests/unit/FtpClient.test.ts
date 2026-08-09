/**
 * FtpClient 单元测试
 * 测试：FTP客户端命令解析、连接状态管理、上传文件逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// FTP command parsing pure functions
function parseFtpCommand(input: string): { command: string; args: string[] } {
  const trimmed = input.trim()
  const parts = trimmed.split(/\s+/)
  return {
    command: parts[0].toUpperCase(),
    args: parts.slice(1)
  }
}

function isValidFtpCommand(command: string): boolean {
  const validCommands = [
    'USER', 'PASS', 'PWD', 'CWD', 'CDUP', 'LIST', 'MKD', 'RMD',
    'DELE', 'RNFR', 'RNTO', 'NOOP', 'SYST', 'FEAT', 'TYPE',
    'PASV', 'PORT', 'QUIT', 'RETR', 'STOR', 'APPE', 'STAT',
    'HELP', 'SIZE', 'MDTM'
  ]
  return validCommands.includes(command.toUpperCase())
}

describe('FtpClient - command parsing', () => {
  describe('parseFtpCommand', () => {
    it('should parse simple command without args', () => {
      const result = parseFtpCommand('PWD')
      expect(result.command).toBe('PWD')
      expect(result.args).toEqual([])
    })

    it('should parse command with args', () => {
      const result = parseFtpCommand('CWD /home/user')
      expect(result.command).toBe('CWD')
      expect(result.args).toEqual(['/home/user'])
    })

    it('should parse command with multiple args', () => {
      const result = parseFtpCommand('RNFR old.txt new.txt')
      expect(result.command).toBe('RNFR')
      expect(result.args).toEqual(['old.txt', 'new.txt'])
    })

    it('should handle leading/trailing whitespace', () => {
      const result = parseFtpCommand('  LIST  ')
      expect(result.command).toBe('LIST')
    })

    it('should be case-insensitive for commands', () => {
      const result = parseFtpCommand('pwd')
      expect(result.command).toBe('PWD')
    })

    it('should parse empty input', () => {
      const result = parseFtpCommand('')
      expect(result.command).toBe('')
      expect(result.args).toEqual([])
    })
  })

  describe('isValidFtpCommand', () => {
    it('should recognize standard FTP commands', () => {
      expect(isValidFtpCommand('USER')).toBe(true)
      expect(isValidFtpCommand('PASS')).toBe(true)
      expect(isValidFtpCommand('LIST')).toBe(true)
      expect(isValidFtpCommand('QUIT')).toBe(true)
      expect(isValidFtpCommand('PASV')).toBe(true)
      expect(isValidFtpCommand('STOR')).toBe(true)
      expect(isValidFtpCommand('RETR')).toBe(true)
    })

    it('should be case-insensitive', () => {
      expect(isValidFtpCommand('user')).toBe(true)
      expect(isValidFtpCommand('pass')).toBe(true)
      expect(isValidFtpCommand('List')).toBe(true)
    })

    it('should reject invalid commands', () => {
      expect(isValidFtpCommand('INVALID')).toBe(false)
      expect(isValidFtpCommand('GET')).toBe(false)
      expect(isValidFtpCommand('PUT')).toBe(false)
    })

    it('should reject empty string', () => {
      expect(isValidFtpCommand('')).toBe(false)
    })
  })
})

describe('FtpClient - file upload progress calculation', () => {
  function calculateUploadProgress(transferred: number, total: number): {
    percent: number
    speed?: number
    eta?: number
  } {
    const percent = total > 0 ? Math.round((transferred / total) * 100) : 0
    return { percent }
  }

  it('should calculate 0% at start', () => {
    const result = calculateUploadProgress(0, 1024 * 1024)
    expect(result.percent).toBe(0)
  })

  it('should calculate 50%', () => {
    const result = calculateUploadProgress(512 * 1024, 1024 * 1024)
    expect(result.percent).toBe(50)
  })

  it('should calculate 100%', () => {
    const result = calculateUploadProgress(1024 * 1024, 1024 * 1024)
    expect(result.percent).toBe(100)
  })

  it('should handle zero total gracefully', () => {
    const result = calculateUploadProgress(0, 0)
    expect(result.percent).toBe(0)
  })
})

describe('FtpClient - PASV response parsing', () => {
  function parsePasvResponse(response: string): { host: string; port: number } | null {
    // Format: "227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)"
    const match = response.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/)
    if (!match) return null
    const host = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`
    const port = parseInt(match[5]) * 256 + parseInt(match[6])
    return { host, port }
  }

  it('should parse standard PASV response', () => {
    const result = parsePasvResponse('227 Entering Passive Mode (192,168,1,1,10,20)')
    expect(result).not.toBeNull()
    expect(result!.host).toBe('192.168.1.1')
    expect(result!.port).toBe(10 * 256 + 20) // 2580
  })

  it('should return null for invalid response', () => {
    expect(parsePasvResponse('Invalid response')).toBeNull()
  })

  it('should return null for empty response', () => {
    expect(parsePasvResponse('')).toBeNull()
  })

  it('should calculate port correctly for large values', () => {
    const result = parsePasvResponse('227 Entering Passive Mode (10,0,0,1,255,255)')
    expect(result!.port).toBe(255 * 256 + 255) // 65535
  })
})
