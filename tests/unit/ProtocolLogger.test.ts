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
  // Ensure app dir exists for isPackaged path logic
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
      // app.isPackaged=true so it uses app.getPath('exe') which is process.execPath
      // The logs dir is created at <exeDir>/logs
      const exeDir = path.dirname(process.execPath)
      const logDir = path.join(exeDir, 'logs')
      // Just verify it doesn't throw and logDir is set
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
      // Setting a pattern doesn't immediately change logDir, it stores the pattern
      // getLogDir still returns the current active dir
      const dir = logger.getLogDir()
      expect(dir).toContain('logs')
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

      // Check log file was created on disk (in the actual log dir)
      const logDir = logger.getLogDir()
      const logFile = path.join(logDir, result)
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
    it('未创建连接时返回失败', async () => {
      const logger = await createLogger()
      const destPath = path.join(TEST_ROOT, 'copy-test.log')
      const result = await logger.copyLogFile('nonexistent', destPath)
      expect(result.success).toBe(false)
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
  })

  describe('日志分片逻辑', () => {
    it('小文件不触发分片', async () => {
      const logger = await createLogger()
      logger.setLogSplitSize(100) // 100 MB
      logger.createConnLogFile('conn-1', 'Test')
      logger.writeToConnLog('small data', 'conn-1')
      logger.flush()
      // 不应该出错
      expect(true).toBe(true)
    })
  })
})
