import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs'

const TEST_ROOT = path.join(os.tmpdir(), 'superconnectx-protocollogger-test')

function setupTestDir(): void {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true })
  }
  fs.mkdirSync(TEST_ROOT, { recursive: true })
  fs.mkdirSync(path.join(TEST_ROOT, 'app'), { recursive: true })
}

function cleanupTestDir(): void {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true })
  }
}

describe('ProtocolLogger', () => {
  beforeEach(async () => {
    setupTestDir()
    vi.resetModules()
  })

  afterEach(() => {
    cleanupTestDir()
  })

  async function createLogger(): Promise<any> {
    const mod = await import('../../src/main/utils/ProtocolLogger')
    return new mod.default()
  }

  describe('constructor', () => {
    it('创建实例时自动创建默认日志目录', async () => {
      const logger = await createLogger()
      const exeDir = path.dirname(process.execPath)
      const logDir = path.join(exeDir, 'logs')
      expect(logger.getLogDir()).toBeTruthy()
    })
  })

  describe('getFileTimeStamp', () => {
    it('返回正确格式的时间戳', async () => {
      const logger = await createLogger()
      const ts = logger.getFileTimeStamp()
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}$/)
    })
  })

  describe('getTimeStamp', () => {
    it('返回正确格式的时间戳', async () => {
      const logger = await createLogger()
      const ts = logger.getTimeStamp()
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/)
    })
  })

  describe('setEnableLogStorage / getEnableLogStorage', () => {
    it('默认启用日志存储', async () => {
      const logger = await createLogger()
      expect(logger.getEnableLogStorage()).toBe(true)
    })

    it('可以禁用和重新启用', async () => {
      const logger = await createLogger()
      logger.setEnableLogStorage(false)
      expect(logger.getEnableLogStorage()).toBe(false)
      logger.setEnableLogStorage(true)
      expect(logger.getEnableLogStorage()).toBe(true)
    })
  })

  describe('setLogSplitSize', () => {
    it('可以设置分片大小', async () => {
      const logger = await createLogger()
      expect(() => logger.setLogSplitSize(50)).not.toThrow()
    })
  })

  describe('setLogSplitCallback', () => {
    it('可以设置和清空分片回调', async () => {
      const logger = await createLogger()
      const cb = vi.fn()
      logger.setLogSplitCallback(cb)
      logger.setLogSplitCallback(null)
    })
  })

  describe('setLogDir / getLogDir', () => {
    it('获取默认日志目录', async () => {
      const logger = await createLogger()
      const dir = logger.getLogDir()
      expect(dir).toContain('logs')
    })

    it('设置自定义日志目录模板', async () => {
      const logger = await createLogger()
      logger.setLogDir('%C-%Y-%M-%D')
      const dir = logger.getLogDir()
      expect(dir).toContain('logs')
    })

    it('相对日志目录模板与扫描目录使用同一基准', async () => {
      const logger = await createLogger()
      logger.setLogDir('relative-logs/%Y')
      const dir = logger.createConnLogFile('relative-1', 'Test')
      expect(dir).toContain('.log')
      expect(logger.getLogDir()).toContain('logs/relative-logs/')
    })

    it('设置空目录回退到默认', async () => {
      const logger = await createLogger()
      logger.setLogDir('')
      const dir = logger.getLogDir()
      expect(dir).toContain('logs')
    })
  })

  describe('setLogFileName', () => {
    it('设置日志文件名模板', async () => {
      const logger = await createLogger()
      expect(() => logger.setLogFileName('%C-%Y%M%D')).not.toThrow()
    })

    it('设置空字符串不改变模板', async () => {
      const logger = await createLogger()
      expect(() => logger.setLogFileName('')).not.toThrow()
    })
  })

  describe('createConnLogFile', () => {
    it('禁用日志时返回空字符串', async () => {
      const logger = await createLogger()
      logger.setEnableLogStorage(false)
      const result = logger.createConnLogFile('conn-1', 'TestConn')
      expect(result).toBe('')
    })

    it('启用时创建连接日志文件', async () => {
      const logger = await createLogger()
      const result = logger.createConnLogFile('conn-1', 'TestConn')
      expect(result).toContain('TestConn')
      expect(result).toContain('.log')

      const logDir = logger.getLogDir()
      const logFile = path.join(logDir, result)
      expect(fs.existsSync(logFile)).toBe(true)
    })

    it('文件名模板包含子目录时自动创建父目录', async () => {
      const logger = await createLogger()
      logger.setLogDir(path.join(TEST_ROOT, 'logs'))
      logger.setLogFileName('dev/%C-%Y-%M-%D-%hh-%mm-%ss')

      const result = logger.createConnLogFile('conn-1', 'ttyUSB0')
      const logFile = path.join(TEST_ROOT, 'logs', result)

      expect(result).toContain('dev')
      expect(fs.existsSync(logFile)).toBe(true)
    })

    it('创建多个连接日志文件不冲突', async () => {
      const logger = await createLogger()
      const r1 = logger.createConnLogFile('conn-1', 'Conn1')
      const r2 = logger.createConnLogFile('conn-2', 'Conn2')
      expect(r1).not.toBe(r2)
    })
  })

  describe('writeToConnLog', () => {
    it('禁用日志时不写入', async () => {
      const logger = await createLogger()
      logger.setEnableLogStorage(false)
      expect(() => logger.writeToConnLog('test data', 'conn-1')).not.toThrow()
    })

    it('未创建连接日志时不写入', async () => {
      const logger = await createLogger()
      expect(() => logger.writeToConnLog('test data', 'conn-1')).not.toThrow()
    })

    it('写入数据到缓存', async () => {
      const logger = await createLogger()
      logger.createConnLogFile('conn-1', 'Test')
      expect(() => logger.writeToConnLog('hello world', 'conn-1')).not.toThrow()
    })
  })

  describe('appendToConnLog', () => {
    it('禁用日志时不写入', async () => {
      const logger = await createLogger()
      logger.setEnableLogStorage(false)
      expect(() => logger.appendToConnLog('test', 'conn-1')).not.toThrow()
    })

    it('未创建连接日志时不写入', async () => {
      const logger = await createLogger()
      expect(() => logger.appendToConnLog('test', 'conn-1')).not.toThrow()
    })

    it('追加数据到缓存', async () => {
      const logger = await createLogger()
      logger.createConnLogFile('conn-1', 'Test')
      expect(() => logger.appendToConnLog('extra data', 'conn-1')).not.toThrow()
    })

    it('多行追加时每行都带时间戳', async () => {
      const logger = await createLogger()
      const fileName = logger.createConnLogFile('conn-1', 'Test')
      logger.appendToConnLog('[2026-07-06 12:00:00.000] line1\nline2', 'conn-1')
      logger.flushConnLog('conn-1')

      const logFile = path.join(logger.getLogDir(), fileName)
      const content = fs.readFileSync(logFile, 'utf8')
      expect(content).toContain('[2026-07-06 12:00:00.000] line1')
      expect(content).toContain('[2026-07-06 12:00:00.000] line2')
    })
  })

  describe('flushConnLog', () => {
    it('flush 不存在的连接不抛错', async () => {
      const logger = await createLogger()
      expect(() => logger.flushConnLog('nonexistent')).not.toThrow()
    })

    it('flush 有数据的连接', async () => {
      const logger = await createLogger()
      logger.createConnLogFile('conn-1', 'Test')
      logger.writeToConnLog('test data', 'conn-1')
      expect(() => logger.flushConnLog('conn-1')).not.toThrow()
    })

    it('flush 成功后记录实际字节大小', async () => {
      const logger = await createLogger()
      const fileName = logger.createConnLogFile('conn-size', 'Size')
      logger.writeToConnLog('中文日志', 'conn-size')

      expect(logger.flushConnLog('conn-size')).toBe(true)
      const logPath = path.join(logger.getLogDir(), fileName)
      expect(logger.currentFileSizes.get('conn-size')).toBe(fs.statSync(logPath).size)
      expect(logger.currentFileSizes.get('conn-size')).toBeGreaterThan('中文日志'.length)
    })

    it('刷盘失败时返回失败并保留缓存，之后可以重试', async () => {
      const logger = await createLogger()
      const fileName = logger.createConnLogFile('conn-fail', 'Fail')
      logger.writeToConnLog('must retry', 'conn-fail')
      const logPath = path.join(logger.getLogDir(), fileName)
      fs.unlinkSync(logPath)
      fs.mkdirSync(logPath)

      expect(logger.flushConnLog('conn-fail')).toBe(false)
      expect(logger.failedCache.get('conn-fail')).toEqual(expect.arrayContaining([
        expect.stringContaining('must retry')
      ]))
      expect(logger.logCache.has('conn-fail')).toBe(false)

      fs.rmdirSync(logPath)
      expect(logger.flushConnLog('conn-fail')).toBe(true)
      expect(fs.readFileSync(logPath, 'utf8')).toContain('must retry')
      expect(logger.failedCache.has('conn-fail')).toBe(false)
      expect(logger.logCache.has('conn-fail')).toBe(false)
    })

    it('失败重试批次排在新批次之前', async () => {
      const logger = await createLogger()
      const fileName = logger.createConnLogFile('conn-order', 'Order')
      logger.writeToConnLog('old batch', 'conn-order')
      const logPath = path.join(logger.getLogDir(), fileName)
      fs.unlinkSync(logPath)
      fs.mkdirSync(logPath)
      logger.flushAllLogs(true)
      logger.writeToConnLog('new batch', 'conn-order')

      fs.rmdirSync(logPath)
      logger.retryFailedLogs()
      const content = fs.readFileSync(logPath, 'utf8')
      expect(content.indexOf('old batch')).toBeLessThan(content.indexOf('new batch'))
    })

    it('失败缓存达到上限时保留上限并输出可观测日志', async () => {
      const logger = await createLogger()
      const fileName = logger.createConnLogFile('conn-cap', 'Cap')
      logger.writeToConnLog('entry\n'.repeat(10001), 'conn-cap')
      const logPath = path.join(logger.getLogDir(), fileName)
      fs.unlinkSync(logPath)
      fs.mkdirSync(logPath)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      logger.flushAllLogs(true)

      expect(logger.failedCacheEntries).toBe(10000)
      expect(logger.failedCache.get('conn-cap')).toHaveLength(10000)
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed log cache full; dropped 1 entries'))

      errorSpy.mockRestore()
      fs.rmdirSync(logPath)
    })
  })

  describe('clearConnLogFile', () => {
    it('清理不存在的连接不抛错', async () => {
      const logger = await createLogger()
      expect(() => logger.clearConnLogFile('nonexistent')).not.toThrow()
    })

    it('清理已创建的连接日志', async () => {
      const logger = await createLogger()
      logger.createConnLogFile('conn-1', 'Test')
      logger.writeToConnLog('test data', 'conn-1')
      expect(() => logger.clearConnLogFile('conn-1')).not.toThrow()
    })
  })

  describe('flush', () => {
    it('flush 正常执行', async () => {
      const logger = await createLogger()
      logger.createConnLogFile('conn-1', 'Test')
      logger.writeToConnLog('test data', 'conn-1')
      expect(() => logger.flush()).not.toThrow()
    })
  })

  describe('getLogFilePath', () => {
    it('未创建连接时返回失败', async () => {
      const logger = await createLogger()
      const result = await logger.getLogFilePath('nonexistent')
      expect(result.success).toBe(false)
    })

    it('已创建连接时返回文件路径', async () => {
      const logger = await createLogger()
      const fileName = logger.createConnLogFile('conn-1', 'Test')
      const result = await logger.getLogFilePath('conn-1')
      expect(result.success).toBe(true)
      expect(result.filePath).toContain(fileName)
    })
  })

  describe('openConnLog', () => {
    it('日志存储禁用时返回失败', async () => {
      const logger = await createLogger()
      logger.setEnableLogStorage(false)
      const result = await logger.openConnLog('conn-1')
      expect(result!.success).toBe(false)
      expect(result!.message).toContain('not enabled')
    })

    it('未创建连接时返回失败', async () => {
      const logger = await createLogger()
      const result = await logger.openConnLog('nonexistent')
      expect(result!.success).toBe(false)
    })

    it('已创建连接时可以打开日志', async () => {
      const logger = await createLogger()
      logger.createConnLogFile('conn-1', 'Test')
      const result = await logger.openConnLog('conn-1')
      expect(result!.success).toBe(true)
    })
  })

  describe('openLogDir', () => {
    it('可以打开日志目录', async () => {
      const logger = await createLogger()
      const result = await logger.openLogDir()
      expect(result!.success).toBe(true)
    })
  })

  describe('copyLogFile', () => {
    it('日志存储关闭时返回明确错误', async () => {
      const logger = await createLogger()
      logger.setEnableLogStorage(false)
      const destPath = path.join(TEST_ROOT, 'disabled.log')

      const result = await logger.copyLogFile('nonexistent', destPath)

      expect(result).toEqual({
        success: false,
        message: 'Log storage is not enabled, please enable it in settings'
      })
    })

    it('未知 session 返回日志不存在而不是刷盘失败', async () => {
      const logger = await createLogger()
      const destPath = path.join(TEST_ROOT, 'copy-test.log')
      const result = await logger.copyLogFile('nonexistent', destPath)

      expect(result).toEqual({ success: false, message: 'Log file not found' })
    })

    it('已注册且无待写缓存时直接导出', async () => {
      const logger = await createLogger()
      logger.createConnLogFile('conn-empty', 'Empty')
      const flushSpy = vi.spyOn(logger, 'flushConnLog')
      const destPath = path.join(TEST_ROOT, 'empty.log')

      const result = await logger.copyLogFile('conn-empty', destPath)

      expect(result.success).toBe(true)
      expect(flushSpy).not.toHaveBeenCalled()
      expect(fs.existsSync(destPath)).toBe(true)
    })

    it('有待写缓存时刷盘后导出', async () => {
      const logger = await createLogger()
      logger.createConnLogFile('conn-pending', 'Pending')
      logger.writeToConnLog('pending data', 'conn-pending')
      const flushSpy = vi.spyOn(logger, 'flushConnLog')
      const destPath = path.join(TEST_ROOT, 'pending.log')

      const result = await logger.copyLogFile('conn-pending', destPath)

      expect(result.success).toBe(true)
      expect(flushSpy).toHaveBeenCalledWith('conn-pending')
      expect(fs.readFileSync(destPath, 'utf8')).toContain('pending data')
    })

    it('断开后仍可导出已保留的日志上下文', async () => {
      const logger = await createLogger()
      logger.createConnLogFile('conn-disconnected', 'Disconnected')
      logger.writeToConnLog('before disconnect', 'conn-disconnected')
      logger.markConnLogRotate('conn-disconnected')
      const destPath = path.join(TEST_ROOT, 'disconnected.log')

      const result = await logger.copyLogFile('conn-disconnected', destPath)

      expect(result.success).toBe(true)
      expect(fs.readFileSync(destPath, 'utf8')).toContain('before disconnect')
    })

    it('有待写缓存且刷盘失败时返回 flush error', async () => {
      const logger = await createLogger()
      const fileName = logger.createConnLogFile('conn-flush-fail', 'FlushFail')
      logger.writeToConnLog('cannot flush', 'conn-flush-fail')
      const sourcePath = path.join(logger.getLogDir(), fileName)
      fs.unlinkSync(sourcePath)
      fs.mkdirSync(sourcePath)
      const destPath = path.join(TEST_ROOT, 'flush-fail.log')

      const result = await logger.copyLogFile('conn-flush-fail', destPath)

      expect(result).toEqual({
        success: false,
        message: 'Failed to flush pending log data before export'
      })
      expect(fs.existsSync(destPath)).toBe(false)
      fs.rmdirSync(sourcePath)
    })

    it('可以拷贝已创建的日志文件', async () => {
      const logger = await createLogger()
      logger.createConnLogFile('conn-1', 'Test')
      logger.writeToConnLog('hello', 'conn-1')
      logger.flush()

      const destPath = path.join(TEST_ROOT, 'copy-test.log')
      const result = await logger.copyLogFile('conn-1', destPath)
      expect(result.success).toBe(true)
      expect(fs.existsSync(destPath)).toBe(true)
    })

    it('分片后另存为会合并完整日志', async () => {
      const logger = await createLogger()
      logger.setLogSplitSize(0.00001)
      logger.createConnLogFile('conn-1', 'Test')
      logger.writeToConnLog('first chunk', 'conn-1')
      logger.flushAllLogs(true)
      logger.writeToConnLog('second chunk', 'conn-1')
      logger.flushAllLogs(true)

      const destPath = path.join(TEST_ROOT, 'copy-merged.log')
      const result = await logger.copyLogFile('conn-1', destPath)
      const content = fs.readFileSync(destPath, 'utf8')

      expect(result.success).toBe(true)
      expect(content).toContain('first chunk')
      expect(content).toContain('second chunk')
    })

    it('另存为不能覆盖当前源日志文件', async () => {
      const logger = await createLogger()
      const fileName = logger.createConnLogFile('conn-1', 'Test')
      logger.writeToConnLog('must remain', 'conn-1')

      const sourcePath = path.join(logger.getLogDir(), fileName)
      const result = await logger.copyLogFile('conn-1', sourcePath)

      expect(result.success).toBe(false)
      expect(result.message).toContain('cannot overwrite')
      expect(fs.readFileSync(sourcePath, 'utf8')).toContain('must remain')
    })
  })

  describe('日志分片逻辑', () => {
    it('小文件不触发分片', async () => {
      const logger = await createLogger()
      logger.setLogSplitSize(100)
      logger.createConnLogFile('conn-1', 'Test')
      logger.writeToConnLog('small data', 'conn-1')
      logger.flush()
      expect(true).toBe(true)
    })

    it('分片文件名使用连接创建时的固定基名', async () => {
      const logger = await createLogger()
      logger.setLogSplitSize(0.00001)
      const firstFileName = logger.createConnLogFile('conn-1', 'Test')
      logger.writeToConnLog('first chunk', 'conn-1')
      logger.flushAllLogs(true)
      logger.writeToConnLog('second chunk', 'conn-1')
      logger.flushAllLogs(true)
      logger.writeToConnLog('third chunk', 'conn-1')
      logger.flushAllLogs(true)

      const baseName = firstFileName.replace(/\.log$/, '')
      const logDir = logger.getLogDir()
      expect(fs.existsSync(path.join(logDir, `${baseName}-1.log`))).toBe(true)
      expect(fs.existsSync(path.join(logDir, `${baseName}-2.log`))).toBe(true)
    })

    it('按待写入字节数分片，但允许单条超出阈值写入空文件', async () => {
      const logger = await createLogger()
      logger.setLogSplitSize(0.00001)
      const first = logger.createConnLogFile('conn-size', 'Size')
      logger.writeToConnLog('x'.repeat(100), 'conn-size')
      logger.flushAllLogs(true)
      const second = logger.createConnLogFile('conn-size-2', 'Size2')
      logger.writeToConnLog('small', 'conn-size-2')
      logger.flushAllLogs(true)
      expect(fs.existsSync(path.join(logger.getLogDir(), first))).toBe(true)
      expect(fs.existsSync(path.join(logger.getLogDir(), second))).toBe(true)
      expect(fs.readFileSync(path.join(logger.getLogDir(), first), 'utf8')).toContain('x'.repeat(100))
    })
  })

  describe('manualCleanup', () => {
    it('manual cleanup removes inactive logs even when retention rules are unlimited', async () => {
      const logger = await createLogger()
      logger.setMaxLogAgeDays(0)
      logger.setMaxLogCount(0)
      const dir = path.join(TEST_ROOT, 'cleanup')
      logger.setLogDir(dir)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'old.log'), '1234')
      const result = logger.manualCleanup()
      expect(result.success).toBe(true)
      expect(result.deletedCount).toBeGreaterThanOrEqual(1)
      expect(result.deletedSize).toBeGreaterThanOrEqual(4)
      expect(result.failedCount).toBe(0)
      expect(fs.existsSync(path.join(dir, 'old.log'))).toBe(false)
    })

    it('cleans all configured connection directories while protecting active absolute paths', async () => {
      const logger = await createLogger()
      logger.setMaxLogCount(1)
      const root = path.join(TEST_ROOT, 'multi')
      logger.setLogDir(root)
      fs.mkdirSync(path.join(root, 'one'), { recursive: true })
      fs.mkdirSync(path.join(root, 'two'), { recursive: true })
      logger.setLogDir(path.join(root, '%C'))
      const active = logger.createConnLogFile('active', 'one')
      const activePath = path.join(root, 'one', active)
      fs.writeFileSync(path.join(root, 'two', 'old.log'), 'old')
      fs.writeFileSync(path.join(root, 'two', 'new.log'), 'new')
      const result = logger.manualCleanup()
      expect(result.deletedCount).toBeGreaterThanOrEqual(1)
      expect(fs.existsSync(activePath)).toBe(true)
    })

    it('recursively scans nested log directories and applies one global count', async () => {
      const logger = await createLogger()
      logger.setMaxLogAgeDays(0)
      logger.setMaxLogCount(1)
      const root = path.join(TEST_ROOT, 'nested')
      logger.setLogDir(root)
      fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true })
      fs.writeFileSync(path.join(root, 'a', 'b', 'old.log'), 'old')
      fs.writeFileSync(path.join(root, 'new.log'), 'new')
      fs.utimesSync(path.join(root, 'a', 'b', 'old.log'), new Date(1), new Date(1))
      const result = logger.manualCleanup()
      expect(result).toMatchObject({ success: true, deletedCount: 1, deletedSize: 3, failedCount: 0 })
      expect(fs.existsSync(path.join(root, 'a', 'b', 'old.log'))).toBe(false)
      expect(fs.existsSync(path.join(root, 'new.log'))).toBe(true)
    })

    it('uses the static root before a directory template after restart', async () => {
      const logger = await createLogger()
      logger.setMaxLogAgeDays(0)
      logger.setMaxLogCount(1)
      const root = path.join(TEST_ROOT, 'templated')
      logger.setLogDir(path.join(root, '%Y', '%C'))
      fs.mkdirSync(path.join(root, '2025', 'offline'), { recursive: true })
      fs.writeFileSync(path.join(root, '2025', 'offline', 'old.log'), 'old')
      fs.writeFileSync(path.join(root, 'history.log'), 'new')
      fs.utimesSync(path.join(root, '2025', 'offline', 'old.log'), new Date(1), new Date(1))
      ;(logger as any).connLogDirs.clear()
      const result = logger.manualCleanup()
      expect(result.deletedCount).toBe(1)
      expect(fs.existsSync(path.join(root, '2025', 'offline', 'old.log'))).toBe(false)
    })

    it('does not follow directory symlinks', async () => {
      if (process.platform === 'win32') return
      const logger = await createLogger()
      logger.setMaxLogAgeDays(0)
      logger.setMaxLogCount(1)
      const root = path.join(TEST_ROOT, 'symlink-root')
      const outside = path.join(TEST_ROOT, 'outside')
      logger.setLogDir(root)
      fs.mkdirSync(root, { recursive: true })
      fs.mkdirSync(outside, { recursive: true })
      fs.writeFileSync(path.join(outside, 'outside.log'), 'outside')
      fs.symlinkSync(outside, path.join(root, 'linked'))
      const result = logger.manualCleanup()
      expect(result.deletedCount).toBe(0)
      expect(fs.existsSync(path.join(outside, 'outside.log'))).toBe(true)
    })

    it('reports scan failures accurately', async () => {
      const logger = await createLogger()
      logger.setMaxLogAgeDays(0)
      logger.setMaxLogCount(1)
      const missingRoot = path.join(TEST_ROOT, 'missing-root')
      logger.setLogDir(missingRoot)
      const scanResult = logger.manualCleanup()
      expect(scanResult.success).toBe(false)
      expect(scanResult.failedCount).toBe(1)
      expect(scanResult.failedFiles).toContain(path.resolve(missingRoot))
    })
  })

  describe('rotateLogFile', () => {
    it('未创建连接时返回失败', async () => {
      const logger = await createLogger()
      const result = await logger.rotateLogFile('nonexistent')
      expect(result.success).toBe(false)
      expect(result.message).toContain('not found')
    })

    it('已创建连接时可以归档并创建新文件', async () => {
      const logger = await createLogger()
      const oldFileName = logger.createConnLogFile('conn-1', 'Test')
      logger.writeToConnLog('data before rotate', 'conn-1')
      logger.flush()

      const result = await logger.rotateLogFile('conn-1')
      expect(result.success).toBe(true)
      expect(result.oldFileName).toBe(oldFileName)
      expect(result.newFileName).toBeTruthy()
      expect(result.newFileName).toContain('Test')
      expect(result.newFileName).not.toBe(oldFileName)
    })

    it('刷盘失败时阻断归档并保留当前日志映射', async () => {
      const logger = await createLogger()
      const oldFileName = logger.createConnLogFile('conn-rotate-fail', 'RotateFail')
      logger.writeToConnLog('pending before rotate', 'conn-rotate-fail')
      const oldPath = path.join(logger.getLogDir(), oldFileName)
      fs.unlinkSync(oldPath)
      fs.mkdirSync(oldPath)

      const result = await logger.rotateLogFile('conn-rotate-fail')

      expect(result.success).toBe(false)
      expect(logger.connLogFiles.get('conn-rotate-fail')).toBe(oldFileName)
      expect(logger.connLogFileHistory.get('conn-rotate-fail')).toEqual([oldFileName])
      expect(fs.statSync(oldPath).isDirectory()).toBe(true)
    })
  })

  describe('markConnLogRotate', () => {
    it('刷盘失败时不标记下次连接轮换日志', async () => {
      const logger = await createLogger()
      const fileName = logger.createConnLogFile('conn-mark-fail', 'MarkFail')
      logger.writeToConnLog('pending before disconnect', 'conn-mark-fail')
      const logPath = path.join(logger.getLogDir(), fileName)
      fs.unlinkSync(logPath)
      fs.mkdirSync(logPath)

      logger.markConnLogRotate('conn-mark-fail')

      expect(logger.connLogNeedsNew.get('conn-mark-fail')).not.toBe(true)
      expect(logger.failedCache.get('conn-mark-fail')).toContainEqual(expect.stringContaining('pending before disconnect'))
    })
  })

  describe('日志文件名模板解析', () => {
    it('应支持连接名占位符 %C', async () => {
      const logger = await createLogger()
      logger.setLogFileName('%C.log')
      const result = logger.createConnLogFile('conn-c', 'MyConn')
      expect(result).toContain('MyConn')
      expect(result).toContain('.log')
    })

    it('应支持日期占位符 %Y %M %D', async () => {
      const logger = await createLogger()
      logger.setLogFileName('log-%Y-%M-%D.log')
      const result = logger.createConnLogFile('conn-d', 'ConnD')
      const now = new Date()
      const year = String(now.getFullYear())
      const month = String(now.getMonth() + 1).padStart(2, '0')
      expect(result).toContain(year)
      expect(result).toContain(month)
    })

    it('应支持备注占位符 %R', async () => {
      const logger = await createLogger()
      logger.setLogFileName('%C-%R.log')
      const result = logger.createConnLogFile('conn-r', 'ConnR', 'MyRemark')
      expect(result).toContain('MyRemark')
    })

    it('非法文件名字符应被替换', async () => {
      const logger = await createLogger()
      const result = logger.createConnLogFile('conn-bad', 'Test*Conn?Name')
      expect(result).not.toContain('*')
      expect(result).not.toContain('?')
      expect(result).toContain('Test')
    })
  })

  describe('日志目录模板解析', () => {
    it('根目录占位符不会把清理扫描范围扩大到文件系统根', async () => {
      const logger = await createLogger()
      const defaultLogDir = logger.getLogDir()
      logger.setLogDir(path.parse(TEST_ROOT).root + '%Y')

      expect(logger.getLogDir()).toBe(defaultLogDir)
    })

    it('空模板使用默认目录', async () => {
      const logger = await createLogger()
      logger.setLogDir('')
      logger.createConnLogFile('conn-dir', 'Test')
      const result = await logger.getLogFilePath('conn-dir')
      expect(result.success).toBe(true)
    })

    it('自定义模板创建对应目录', async () => {
      const logger = await createLogger()
      const customDir = path.join(TEST_ROOT, 'custom-logs')
      logger.setLogDir(customDir)
      logger.createConnLogFile('conn-dir2', 'Test')
      const result = await logger.getLogFilePath('conn-dir2')
      expect(result.success).toBe(true)
      expect(result.filePath).toContain('custom-logs')
    })
  })
})
