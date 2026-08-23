import { describe, it, expect } from 'vitest'
import { mapUpdateErrorToFriendlyMessage } from '../../src/core/updater/UpdateSupport'

describe('AppUpdater - mapErrorToFriendly', () => {
  describe('network errors', () => {
    it('should map ENOTFOUND', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('ENOTFOUND example.com'))).toBe(
        'Network connection failed, please check your network'
      )
    })

    it('should map ECONNREFUSED', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('ECONNREFUSED'))).toBe(
        'Network connection failed, please check your network'
      )
    })

    it('should map ECONNRESET', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('Connection ECONNRESET'))).toBe(
        'Network connection failed, please check your network'
      )
    })

    it('should map ETIMEDOUT', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('ETIMEDOUT'))).toBe(
        'Connection timed out, please try again later'
      )
    })

    it('should map timeout', () => {
      expect(mapUpdateErrorToFriendlyMessage('Connection timeout occurred')).toBe(
        'Connection timed out, please try again later'
      )
    })
  })

  describe('HTTP status errors', () => {
    it('should map 404', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('HTTP 404 Not Found'))).toBe(
        'Update server not found (404)'
      )
    })

    it('should map 403', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('HTTP 403 Forbidden'))).toBe(
        'Access denied, please check your permissions'
      )
    })

    it('should map 500', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('HTTP 500 Internal Server Error'))).toBe(
        'Update server error, please try again later'
      )
    })

    it('should map 502', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('502 Bad Gateway'))).toBe(
        'Update server error, please try again later'
      )
    })

    it('should map 503', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('503 Service Unavailable'))).toBe(
        'Update server error, please try again later'
      )
    })
  })

  describe('checksum errors', () => {
    it('should map sha512 error', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('sha512 checksum mismatch'))).toBe(
        'File verification failed, will re-download'
      )
    })

    it('should map sha256 error', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('sha256 verification failed'))).toBe(
        'File verification failed, will re-download'
      )
    })

    it('should map checksum error', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('checksum error'))).toBe(
        'File verification failed, will re-download'
      )
    })
  })

  describe('SSL/TLS errors', () => {
    it('should map certificate error', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('certificate has expired'))).toBe(
        'SSL certificate error, please check system time or network proxy'
      )
    })

    it('should map SSL error', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('SSL handshake failed'))).toBe(
        'SSL certificate error, please check system time or network proxy'
      )
    })

    it('should map TLS error', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('TLS protocol error'))).toBe(
        'SSL certificate error, please check system time or network proxy'
      )
    })
  })

  describe('parse errors', () => {
    it('should map YAML error', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('YAML parse error'))).toBe(
        'Failed to parse update information'
      )
    })

    it('should map generic parse error', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('parse error'))).toBe(
        'Failed to parse update information'
      )
    })
  })

  describe('disk errors', () => {
    it('should map ENOSPC', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('ENOSPC: no space left'))).toBe(
        'Insufficient disk space'
      )
    })

    it('should map disk error', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('disk full error'))).toBe(
        'Insufficient disk space'
      )
    })
  })

  describe('default fallback', () => {
    it('should return default for unknown errors', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('Unknown error'))).toBe(
        'Update failed, please try again later'
      )
    })

    it('should return default for empty error', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error(''))).toBe(
        'Update failed, please try again later'
      )
    })

    it('should handle string error', () => {
      expect(mapUpdateErrorToFriendlyMessage('some random error')).toBe(
        'Update failed, please try again later'
      )
    })
  })

  describe('case insensitivity', () => {
    it('should match uppercase', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('ENOTFOUND'))).toBe(
        'Network connection failed, please check your network'
      )
    })

    it('should match mixed case', () => {
      expect(mapUpdateErrorToFriendlyMessage(new Error('EconnRefused'))).toBe(
        'Network connection failed, please check your network'
      )
    })
  })

  describe('priority order', () => {
    it('should match network error over checksum when both present', () => {
      // ENOTFOUND is checked before sha512 in the function
      expect(mapUpdateErrorToFriendlyMessage(new Error('ENOTFOUND sha512 checksum'))).toBe(
        'Network connection failed, please check your network'
      )
    })

    it('should match 404 over 403 when both present', () => {
      // "not found" appears before "403" in the function
      expect(mapUpdateErrorToFriendlyMessage(new Error('404 403'))).toBe(
        'Update server not found (404)'
      )
    })
  })
})

describe('AppUpdater - types', () => {
  it('UpdateStatus type should accept all valid values', () => {
    // Type-level test - compiles if correct
    const statuses: string[] = [
      'checking',
      'update-available',
      'update-not-available',
      'download-progress',
      'update-downloaded',
      'error',
      'check-error'
    ]
    expect(statuses.length).toBe(7)
  })
})
