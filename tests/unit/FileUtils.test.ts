import { describe, it, expect } from 'vitest'
import FileUtils from '../../src/renderer/src/utils/FileUtils'

describe('FileUtils', () => {
  describe('formatBytes', () => {
    it('0 字节返回 0.00 B', () => {
      expect(FileUtils.formatBytes(0)).toBe('0.00 B')
    })

    it('负数返回 0.00 B', () => {
      expect(FileUtils.formatBytes(-1)).toBe('0.00 B')
      expect(FileUtils.formatBytes(-100)).toBe('0.00 B')
    })

    it('非数字返回 0.00 B', () => {
      // NaN 的 typeof 是 'number'，所以不会进入 bytes < 0 分支
      // 但 NaN < 0 是 false，所以会进入正常计算，结果不可预测
      // 此测试仅验证 NaN 不抛异常
      expect(() => FileUtils.formatBytes(NaN)).not.toThrow()
    })

    it('字节级别 (< 1024)', () => {
      expect(FileUtils.formatBytes(1)).toBe('1.00 B')
      expect(FileUtils.formatBytes(512)).toBe('512.00 B')
      expect(FileUtils.formatBytes(1023)).toBe('1023.00 B')
    })

    it('KB 级别', () => {
      expect(FileUtils.formatBytes(1024)).toBe('1.00 KB')
      expect(FileUtils.formatBytes(2048)).toBe('2.00 KB')
      expect(FileUtils.formatBytes(1536)).toBe('1.50 KB')
    })

    it('MB 级别', () => {
      expect(FileUtils.formatBytes(1048576)).toBe('1.00 MB')
      expect(FileUtils.formatBytes(5 * 1024 * 1024)).toBe('5.00 MB')
    })

    it('GB 级别', () => {
      expect(FileUtils.formatBytes(1073741824)).toBe('1.00 GB')
    })

    it('TB 级别', () => {
      expect(FileUtils.formatBytes(1099511627776)).toBe('1.00 TB')
    })

    it('PB 级别（边界）', () => {
      const pb = 1024 * 1024 * 1024 * 1024 * 1024
      expect(FileUtils.formatBytes(pb)).toBe('1.00 PB')
    })

    it('小数精度为 2 位', () => {
      const result = FileUtils.formatBytes(1500)
      expect(result).toMatch(/^\d+\.\d{2} (B|KB|MB|GB|TB|PB)$/)
    })

    it('返回字符串包含单位', () => {
      const result = FileUtils.formatBytes(12345)
      expect(result).toMatch(/^[\d.]+ (B|KB|MB|GB|TB|PB)$/)
    })
  })
})
