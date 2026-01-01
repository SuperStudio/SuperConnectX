export default class FileUtils {
  /**
   * 将字节数转换为可读的文件大小格式
   * @param {number} bytes - 原始字节数（必须是数字）
   * @param {number} [decimals=2] - 保留的小数位数，默认2位
   * @returns {string} 可读的大小字符串，如 "1.25 MB"、"890 B"
   */
  static formatBytes(bytes: number): string {
    if (typeof bytes !== 'number' || bytes < 0) {
      return '0.00 B'
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

    const k = 1024

    if (bytes === 0) {
      return `0.00 ${units[0]}`
    }

    const i = Math.floor(Math.log(bytes) / Math.log(k))

    const formattedNumber = (bytes / Math.pow(k, i)).toFixed(2)

    return `${formattedNumber} ${units[i]}`
  }
}
