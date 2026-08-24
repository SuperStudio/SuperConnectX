import { describe, expect, it } from 'vitest'
import {
  projectCommandText,
  sanitizeAuditDetails,
  sanitizeKnownSecrets
} from '../../src/main/extensions/ai-control/application/AuditSanitizer'

describe('AuditSanitizer', () => {
  it('applies none, preview and full command policies', () => {
    expect(sanitizeAuditDetails({ command: 'secret command', sessionId: 's1' }, 'none')).toEqual({
      sessionId: 's1'
    })
    expect(
      sanitizeAuditDetails({ command: 'x'.repeat(200), sessionId: 's1' }, 'preview')?.command
    ).toBe('x'.repeat(120))
    expect(sanitizeAuditDetails({ command: 'full command' }, 'full')?.command).toBe('full command')
  })

  it('recursively removes secret keys and redacts common assignments', () => {
    const sanitized = sanitizeKnownSecrets({
      token: 'top-secret',
      writeLeaseId: 'lease-secret',
      nested: {
        password: 'nested-secret',
        command: 'AT token=abc password="123" wifi_key=my-key writeLeaseId=temporary-lease'
      },
      list: [{ Authorization: 'Bearer abc', value: 'safe' }]
    })
    expect(JSON.stringify(sanitized)).not.toContain('top-secret')
    expect(JSON.stringify(sanitized)).not.toContain('nested-secret')
    expect(JSON.stringify(sanitized)).not.toContain('lease-secret')
    expect(JSON.stringify(sanitized)).not.toContain('temporary-lease')
    expect(JSON.stringify(sanitized)).not.toContain('Bearer abc')
    expect(JSON.stringify(sanitized)).toContain('token=[REDACTED]')
    expect(JSON.stringify(sanitized)).toContain('password=[REDACTED]')
    expect(JSON.stringify(sanitized)).toContain('wifi_key=[REDACTED]')
    expect(JSON.stringify(sanitized)).toContain('writeLeaseId=[REDACTED]')
  })

  it('projects TX command text without exposing known secrets', () => {
    expect(projectCommandText('password=abc', 'none')).toBeUndefined()
    expect(projectCommandText('password=abc', 'preview')).toBe('password=[REDACTED]')
    expect(projectCommandText('x'.repeat(200), 'preview')).toHaveLength(120)
  })
})
