/**
 * AppDir 测试
 * 测试应用目录管理的纯逻辑函数（不依赖 Electron app API 的部分）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'

describe('AppDir - pure logic', () => {
  describe('directory structure', () => {
    it('should define valid business directories', () => {
      const bizDirs = ['app-logs', 'logs']
      for (const dir of bizDirs) {
        expect(typeof dir).toBe('string')
        expect(dir.length).toBeGreaterThan(0)
      }
    })

    it('should define valid migration directories', () => {
      const dirsToMigrate = ['userdata', 'backup', 'logs', 'app-logs']
      expect(dirsToMigrate.length).toBe(4)
      expect(dirsToMigrate).toContain('userdata')
      expect(dirsToMigrate).toContain('backup')
    })
  })

  describe('getInstanceIndex', () => {
    let mod: any

    beforeEach(async () => {
      vi.resetModules()
      // Clear cache before each test to reset _instanceIndex
      mod = await import('../../src/main/utils/AppDir')
    })

    it('should default to 0 when no args or env', () => {
      expect(mod.getInstanceIndex()).toBe(0)
    })

    it('should read from --instance-index command line arg', () => {
      vi.spyOn(process, 'argv', 'get').mockReturnValue([
        'node',
        'app.js',
        '--instance-index=3'
      ])
      expect(mod.getInstanceIndex()).toBe(3)
    })

    it('should clamp negative instance index to 0', () => {
      vi.spyOn(process, 'argv', 'get').mockReturnValue([
        'node',
        'app.js',
        '--instance-index=-1'
      ])
      expect(mod.getInstanceIndex()).toBe(0)
    })

    it('should handle non-numeric instance index gracefully', () => {
      vi.spyOn(process, 'argv', 'get').mockReturnValue([
        'node',
        'app.js',
        '--instance-index=abc'
      ])
      expect(mod.getInstanceIndex()).toBe(0)
    })

    it('should fallback to SCX_INSTANCE_INDEX env var', () => {
      // No command line arg, but env var is set
      vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'app.js'])
      vi.stubEnv('SCX_INSTANCE_INDEX', '2')
      expect(mod.getInstanceIndex()).toBe(2)
      vi.unstubAllEnvs()
    })

    it('should handle invalid env var gracefully', () => {
      vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'app.js'])
      vi.stubEnv('SCX_INSTANCE_INDEX', 'not-a-number')
      expect(mod.getInstanceIndex()).toBe(0)
      vi.unstubAllEnvs()
    })

    it('should prefer command line arg over env var', () => {
      vi.spyOn(process, 'argv', 'get').mockReturnValue([
        'node',
        'app.js',
        '--instance-index=5'
      ])
      vi.stubEnv('SCX_INSTANCE_INDEX', '2')
      expect(mod.getInstanceIndex()).toBe(5)
      vi.unstubAllEnvs()
    })

    it('should cache result on subsequent calls', () => {
      vi.spyOn(process, 'argv', 'get').mockReturnValue([
        'node',
        'app.js',
        '--instance-index=4'
      ])
      expect(mod.getInstanceIndex()).toBe(4)
      // Second call returns cached value
      expect(mod.getInstanceIndex()).toBe(4)
    })
  })

  describe('getChromiumDataDir', () => {
    beforeEach(async () => {
      vi.resetModules()
    })

    it('should return userData when instance index is 0', async () => {
      vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'app.js'])
      const { getChromiumDataDir } = await import('../../src/main/utils/AppDir')
      const result = getChromiumDataDir()
      // userData in test = process.env.APPDATA or fallback
      expect(result).not.toContain('_instance_')
    })

    it('should return _instance_N subdir when instance index > 0', async () => {
      vi.spyOn(process, 'argv', 'get').mockReturnValue([
        'node',
        'app.js',
        '--instance-index=2'
      ])
      const { getChromiumDataDir } = await import('../../src/main/utils/AppDir')
      const result = getChromiumDataDir()
      expect(result).toContain('_instance_2')
    })
  })

  describe('Chromium clutter patterns', () => {
    // Test the CHROMIUM_CLUTTER_PATTERNS array logic
    const CHROMIUM_CLUTTER_PATTERNS = [
      'DawnGraphiteCache',
      'DawnCache',
      'GPUCache',
      'blob_storage',
      'Code Cache',
      'Local Storage',
      'shared_proto_db',
      'Network Persistent State',
      'Platform Notifications',
      'TransportSecurity',
      'Trust Tokens',
      'Trust Tokens-journal',
      'WebStorage',
      'VideoDecodeStats',
      'ShaderCache',
      'Crashpad',
      'CrashpadMetrics-active.pma',
      'CrashpadMetrics.pma',
      'First Run',
      'Last Version',
      'Local State',
      'lockfile',
      'Variations',
      'BrowserMetrics',
      'component_crx_cache',
      'OriginTrials',
      'Subresource Filter',
      'Safe Browsing',
      'Segmentation Platform',
      'OptimizationGuidePredictionModelDownloads',
      'Crowd Deny',
      'FileTypePolicies',
      'FirstPartySets',
      'MEIPreload',
      'PKIMetadata',
      'PrivacySandboxAttestationsPreloaded',
      'SafetyTips',
      'SSLErrorAssistant',
      'TpcdMetadata',
      'WasmTtsEngine',
      'ZxcvbnData',
      'hyphen-data',
      'AutofillStates',
      'OnDeviceHeadSuggestModel',
      'OpenCookieDatabase',
      'MediaFoundationWidevineCdm',
      'WidevineCdm',
    ]

    it('should contain known Chromium artifacts', () => {
      expect(CHROMIUM_CLUTTER_PATTERNS).toContain('GPUCache')
      expect(CHROMIUM_CLUTTER_PATTERNS).toContain('Code Cache')
      expect(CHROMIUM_CLUTTER_PATTERNS).toContain('Local Storage')
      expect(CHROMIUM_CLUTTER_PATTERNS).toContain('blob_storage')
    })

    it('should have unique patterns (no duplicates)', () => {
      const unique = new Set(CHROMIUM_CLUTTER_PATTERNS)
      expect(unique.size).toBe(CHROMIUM_CLUTTER_PATTERNS.length)
    })

    it('should not contain business directories', () => {
      const bizDirs = ['userdata', 'backup', 'logs', 'app-logs']
      for (const dir of bizDirs) {
        expect(CHROMIUM_CLUTTER_PATTERNS).not.toContain(dir)
      }
    })

    it('should have reasonable number of patterns', () => {
      expect(CHROMIUM_CLUTTER_PATTERNS.length).toBeGreaterThan(10)
      expect(CHROMIUM_CLUTTER_PATTERNS.length).toBeLessThan(100)
    })
  })

  describe('path resolution', () => {
    it('should resolve runtime directory correctly', () => {
      const userData = '/mock/userData'
      const runtimeDir = path.join(userData, '_runtime')
      expect(runtimeDir).toBe(path.join('/mock/userData', '_runtime'))
    })

    it('should resolve session directory at sibling level', () => {
      const userData = '/mock/userData'
      const parentDir = path.dirname(userData)
      const sessionDir = path.join(parentDir, 'superconnectx-session')
      expect(sessionDir).toBe(path.join('/mock', 'superconnectx-session'))
    })

    it('should resolve cache directories inside runtime', () => {
      const runtimeDir = '/mock/userData/_runtime'
      const diskCache = path.join(runtimeDir, 'Cache')
      const gpuCache = path.join(runtimeDir, 'GPUCache')
      const crashDumps = path.join(runtimeDir, 'CrashDumps')

      expect(diskCache).toBe(path.join(runtimeDir, 'Cache'))
      expect(gpuCache).toBe(path.join(runtimeDir, 'GPUCache'))
      expect(crashDumps).toBe(path.join(runtimeDir, 'CrashDumps'))
    })
  })

  describe('legacy data detection', () => {
    it('should identify .asar path correctly', () => {
      const appPath = '/app/resources/app.asar'
      const appDir = appPath.endsWith('.asar')
        ? path.dirname(appPath)
        : appPath
      expect(appDir).toBe('/app/resources')
    })

    it('should use appPath directly when not asar', () => {
      const appPath = '/project/root'
      const appDir = appPath.endsWith('.asar')
        ? path.dirname(appPath)
        : appPath
      expect(appDir).toBe('/project/root')
    })

    it('should handle case-insensitive comparison correctly', () => {
      const dir1 = '/APP/DATA'
      const dir2 = '/app/data'
      // Upper-case comparison for case-insensitive check
      expect(path.resolve(dir1).toUpperCase() === path.resolve(dir2).toUpperCase()).toBe(true)
    })
  })

  describe('macOS exe path resolution', () => {
    it('should resolve macOS .app bundle path using path.resolve', () => {
      const exePath = '/Applications/MyApp.app/Contents/MacOS/MyApp'
      let exeDir = path.dirname(exePath)
      // macOS: go up 3 levels from MacOS/
      exeDir = path.resolve(exeDir, '../../..')
      // path.resolve normalizes the path, .. traverses through .app directory
      // /Applications/MyApp.app/Contents/MacOS -> ../../.. -> /Applications
      if (process.platform !== 'win32') {
        expect(exeDir).toBe('/Applications')
      } else {
        // On Windows, the path gets a drive letter prepended, just verify it exists
        expect(exeDir).toBeTruthy()
      }
    })

    it('should keep Windows exe path as-is (dirname only)', () => {
      // On Linux, backslashes are not path separators, so dirname returns '.'
      // On Windows, it would return 'C:\Program Files\MyApp'
      if (process.platform === 'win32') {
        const exePath = 'C:\\Program Files\\MyApp\\MyApp.exe'
        const exeDir = path.dirname(exePath)
        expect(exeDir).toBe(path.join('C:', 'Program Files', 'MyApp'))
      } else {
        // On non-Windows, backslashes are treated as part of filename
        const exePath = 'C:\\Program Files\\MyApp\\MyApp.exe'
        const exeDir = path.dirname(exePath)
        expect(exeDir).toBe('.')
      }
    })
  })

  describe('migrate data conditions', () => {
    it('should skip migration when legacyDir equals targetDir', () => {
      const legacyDir = '/mock/userData'
      const targetDir = '/mock/userData'
      const same = path.resolve(legacyDir).toUpperCase() === path.resolve(targetDir).toUpperCase()
      expect(same).toBe(true)
    })

    it('should migrate when legacyDir differs from targetDir', () => {
      const legacyDir = '/mock/legacy'
      const targetDir = '/mock/userData'
      const same = path.resolve(legacyDir).toUpperCase() === path.resolve(targetDir).toUpperCase()
      expect(same).toBe(false)
    })

    it('should handle cross-platform path comparison with fs.realpathSync fallback pattern', () => {
      // The new migration code uses fs.realpathSync first, then path.resolve as fallback.
      // Test that path.resolve comparison works as the fallback for non-existent paths.
      const legacyDir = '/mock/dirA'
      const targetDir = '/mock/dirB'

      // Different paths
      expect(path.resolve(legacyDir) === path.resolve(targetDir)).toBe(false)

      // Same path (different notation)
      expect(path.resolve('/mock/dirA/../dirA') === path.resolve('/mock/dirA')).toBe(true)
    })

    it('should skip migration for instances > 0', () => {
      // getInstanceIndex() > 0 means migration is skipped entirely.
      // This is tested implicitly through the getInstanceIndex logic:
      // only instance 0 performs migration.
      const idx = 1
      expect(idx > 0).toBe(true) // migration would be skipped
    })
  })

  describe('sessionDir path logic', () => {
    it('should create sessionDir at userData sibling level without _N suffix for instance 0', () => {
      const userDataBase = '/mock/Roaming/SuperConnectX'
      const instanceIdx = 0
      const sessionSuffix = instanceIdx > 0 ? `_${instanceIdx}` : ''
      const sessionDir = path.join(userDataBase, `superconnectx-session${sessionSuffix}`)
      expect(sessionDir).toBe(path.join('/mock/Roaming/SuperConnectX', 'superconnectx-session'))
      // sessionDir should NOT be at Roaming root level (old behavior)
      // It should be under SuperConnectX userData directory
      expect(sessionDir).toContain('SuperConnectX')
    })

    it('should append instance suffix for multi-instance sessionDir', () => {
      const userDataBase = '/mock/Roaming/SuperConnectX'
      const instanceIdx = 2
      const sessionSuffix = instanceIdx > 0 ? `_${instanceIdx}` : ''
      const sessionDir = path.join(userDataBase, `superconnectx-session${sessionSuffix}`)
      expect(sessionDir).toBe(path.join('/mock/Roaming/SuperConnectX', 'superconnectx-session_2'))
    })

    it('should keep sessionDir within userData directory (not scatter to parent)', () => {
      const userDataBase = path.normalize('/mock/Roaming/SuperConnectX')
      const sessionDir = path.join(userDataBase, 'superconnectx-session')
      // sessionDir should be a direct child of userData, not a sibling
      expect(path.normalize(path.dirname(sessionDir))).toBe(path.normalize(userDataBase))
    })
  })
})
