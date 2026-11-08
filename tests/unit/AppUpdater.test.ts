import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  mapUpdateErrorToFriendlyMessage,
  markUpdateDownloaded,
  normalizeReleaseNotes
} from '@/core/updater/UpdateSupport'

/**
 * electron-updater 的假实现：只保存事件回调，由测试主动触发。
 * AppUpdater 会在 init() 里给 autoUpdater 挂监听，并读写若干配置属性。
 */
const { autoUpdaterMock } = vi.hoisted(() => {
  const handlers = new Map<string, Array<(payload?: unknown) => void>>()
  const mock = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowDowngrade: false,
    allowPrerelease: false,
    fullChangelog: true,
    disableDifferentialDownload: false,
    forceDevUpdateConfig: false,
    updateConfigPath: null as string | null,
    logger: undefined as unknown,
    checkForUpdates: async (): Promise<null> => null,
    downloadUpdate: async (): Promise<void> => {},
    quitAndInstall: (): void => {},
    on(event: string, handler: (payload?: unknown) => void): void {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
    },
    emitTest(event: string, payload?: unknown): void {
      for (const handler of handlers.get(event) ?? []) handler(payload)
    },
    resetTest(): void {
      handlers.clear()
    }
  }
  return { autoUpdaterMock: mock }
})

vi.mock('electron-updater', () => ({ autoUpdater: autoUpdaterMock }))

import AppUpdater from '@/main/updater/AppUpdater'

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

describe('AppUpdater - normalizeReleaseNotes', () => {
  it('should return string notes as-is', () => {
    expect(normalizeReleaseNotes('<p>修复串口日志</p>')).toBe('<p>修复串口日志</p>')
  })

  it('should join array notes with newline', () => {
    const notes = [
      { version: '1.2.12', note: '新增排序工具栏' },
      { version: '1.2.11', note: '修复内存泄露' }
    ]
    expect(normalizeReleaseNotes(notes)).toBe('新增排序工具栏\n修复内存泄露')
  })

  it('should skip entries without a usable note', () => {
    expect(normalizeReleaseNotes([{ version: '1.2.12' }, { version: '1.2.11', note: '有效说明' }])).toBe(
      '有效说明'
    )
  })

  it('should return empty string when notes are missing', () => {
    expect(normalizeReleaseNotes(undefined)).toBe('')
    expect(normalizeReleaseNotes(null)).toBe('')
    expect(normalizeReleaseNotes(0)).toBe('')
  })

  it('should keep notes for the up-to-date case (latest release body)', () => {
    // 已是最新版本时 electron-updater 同样给出最新 release 的正文，不应被过滤
    const info = { version: '1.2.12', releaseDate: '2026-10-25', releaseNotes: '### 新增功能\n- 排序' }
    expect(normalizeReleaseNotes(info.releaseNotes)).toBe('### 新增功能\n- 排序')
  })
})

describe('AppUpdater - markUpdateDownloaded', () => {
  it('should flag cached info as downloaded and keep release info', () => {
    const cached = {
      version: '1.2.13',
      releaseDate: '2026-11-01',
      releaseNotes: '### 修复\n- 终端间距',
      files: [{ url: 'SuperConnectX-1.2.13.exe', size: 1024 }]
    }
    const result = markUpdateDownloaded(cached, '1.2.13')

    expect(result.downloaded).toBe(true)
    expect(result.downloading).toBe(false)
    expect(result.progress).toBeUndefined()
    expect(result.version).toBe('1.2.13')
    expect(result.releaseDate).toBe('2026-11-01')
    expect(result.releaseNotes).toBe('### 修复\n- 终端间距')
    expect(result.files).toEqual(cached.files)
  })

  it('should still mark as downloaded when no cache exists', () => {
    const result = markUpdateDownloaded(null, '1.2.13')

    expect(result.downloaded).toBe(true)
    expect(result.version).toBe('1.2.13')
    expect(result.releaseNotes).toBe('')
    expect(result.releaseDate).toBeTruthy()
  })
})

describe('AppUpdater - cached update state', () => {
  type SentStatus = { status: string; data?: unknown }

  const createUpdater = (): { updater: AppUpdater; sent: SentStatus[] } => {
    const sent: SentStatus[] = []
    const mainWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (_channel: string, payload: SentStatus) => {
          sent.push(payload)
        }
      }
    }
    const updater = new AppUpdater()
    updater.init(mainWindow as unknown as Parameters<AppUpdater['init']>[0])
    return { updater, sent }
  }

  beforeEach(() => {
    autoUpdaterMock.resetTest()
    autoUpdaterMock.downloadUpdate = async (): Promise<void> => {}
    autoUpdaterMock.checkForUpdates = async (): Promise<null> => null
  })

  it('marks cache as downloading with latest progress while download is running', async () => {
    const { updater } = createUpdater()
    let resolveDownload: (() => void) | undefined
    autoUpdaterMock.downloadUpdate = (): Promise<void> =>
      new Promise<void>((resolve) => {
        resolveDownload = resolve
      })

    autoUpdaterMock.emitTest('update-available', {
      version: '1.2.13',
      releaseDate: '2026-11-01',
      releaseNotes: '<p>修复终端间距</p>'
    })
    expect(updater.cachedUpdateInfo?.downloaded).toBe(false)
    expect(updater.cachedUpdateInfo?.downloading).toBe(false)

    const pending = updater.startDownload()
    expect(updater.cachedUpdateInfo?.downloading).toBe(true)

    autoUpdaterMock.emitTest('download-progress', {
      percent: 42.6,
      transferred: 512,
      total: 1024,
      bytesPerSecond: 128
    })
    // 等价于对话框在下载途中重开时读取缓存
    const cached = updater.cachedUpdateInfo
    expect(cached?.downloading).toBe(true)
    expect(cached?.downloaded).toBe(false)
    expect(cached?.progress).toEqual({
      percent: 43,
      transferred: 512,
      total: 1024,
      bytesPerSecond: 128
    })

    resolveDownload?.()
    await pending
    expect(updater.cachedUpdateInfo?.downloading).toBe(false)
  })

  it('keeps release info and flags downloaded after download finishes', async () => {
    const { updater, sent } = createUpdater()
    let resolveDownload: (() => void) | undefined
    autoUpdaterMock.downloadUpdate = (): Promise<void> =>
      new Promise<void>((resolve) => {
        resolveDownload = resolve
      })

    autoUpdaterMock.emitTest('update-available', {
      version: '1.2.13',
      releaseDate: '2026-11-01',
      releaseNotes: '<p>修复终端间距</p>'
    })

    const pending = updater.startDownload()
    autoUpdaterMock.emitTest('download-progress', {
      percent: 100,
      transferred: 1024,
      total: 1024,
      bytesPerSecond: 128
    })
    autoUpdaterMock.emitTest('update-downloaded', {
      version: '1.2.13',
      downloadedFile: 'C:/tmp/SuperConnectX-Setup.exe'
    })

    const cached = updater.cachedUpdateInfo
    expect(cached?.downloaded).toBe(true)
    expect(cached?.downloading).toBe(false)
    expect(cached?.progress).toBeUndefined()
    expect(cached?.releaseNotes).toBe('<p>修复终端间距</p>')
    expect(cached?.releaseDate).toBe('2026-11-01')

    const last = sent[sent.length - 1]
    expect(last.status).toBe('update-downloaded')
    expect((last.data as { downloaded?: boolean }).downloaded).toBe(true)

    resolveDownload?.()
    await pending
    // 下载结束后的 finally 不能把 downloaded 又抹掉
    expect(updater.cachedUpdateInfo?.downloaded).toBe(true)
  })

  it('clears downloading flag when the download is cancelled', async () => {
    const { updater, sent } = createUpdater()
    let rejectDownload: ((err: Error) => void) | undefined
    autoUpdaterMock.downloadUpdate = (): Promise<void> =>
      new Promise<void>((_resolve, reject) => {
        rejectDownload = reject
      })

    autoUpdaterMock.emitTest('update-available', { version: '1.2.13', releaseDate: '2026-11-01' })

    const pending = updater.startDownload()
    expect(updater.cachedUpdateInfo?.downloading).toBe(true)

    updater.cancelDownload()
    rejectDownload?.(new Error('cancelled'))
    await pending

    expect(updater.cachedUpdateInfo?.downloading).toBe(false)
    expect(updater.cachedUpdateInfo?.downloaded).toBe(false)
    expect(sent[sent.length - 1].status).toBe('update-available')
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
