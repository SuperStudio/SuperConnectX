import { appendFile, existsSync, mkdirSync } from 'fs'
import { shell } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import path from 'path'

export default class logger {
  logDir: string
  // 存储每个连接对应的日志文件名
  private connLogFiles = new Map<number, string>()

  constructor() {
    // 日志目录改为exe所在目录下的logs
    const exePath = app.getPath('exe')
    const appDir = path.dirname(exePath)
    this.logDir = join(appDir, 'logs')

    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true })
    }
  }

  // 生成「年-月-日-时分秒毫秒」格式的时间戳
  getTimeStamp() {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}-${String(
      date.getMinutes()
    ).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}-${String(
      date.getMilliseconds()
    ).padStart(3, '0')}`
  }

  // 为新连接创建唯一日志文件
  createConnLogFile(connId: number, connName: string): string {
    // 生成唯一文件名：时间戳+连接名+连接ID（确保绝对唯一）
    const safeName = connName.replace(/[\\/*?:"<>|]/g, '-') // 过滤特殊字符
    const fileName = `${safeName}-${this.getTimeStamp()}.log`

    // 存储连接与日志文件的映射
    this.connLogFiles.set(connId, fileName)
    return fileName
  }

  // 写入指定连接的日志
  writeToConnLog(data: string, connId: number) {
    const fileName = this.connLogFiles.get(connId)
    if (!fileName) {
      console.error(`未找到连接ID ${connId} 的日志文件`)
      return
    }

    const logFile = join(this.logDir, fileName)
    appendFile(logFile, data + '\n', (err) => {
      if (err) {
        console.error('写入日志失败:', err)
      }
    })
  }

  // 连接关闭时清除映射（可选）
  clearConnLogFile(connId: number) {
    this.connLogFiles.delete(connId)
  }

  // 打开指定连接的日志文件
  async openConnLog(connId: number) {
    try {
      const fileName = this.connLogFiles.get(connId)
      if (!fileName) {
        return { success: false, message: '未找到连接日志' }
      }

      const logFilePath = join(this.logDir, fileName)

      if (!existsSync(logFilePath)) {
        await fs.writeFile(logFilePath, '', 'utf-8')
        console.log('日志文件不存在，已创建空文件')
      }

      await shell.showItemInFolder(logFilePath)
      return { success: true }
    } catch (error) {
      console.error('打开日志失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '打开日志文件失败'
      }
    }
  }

  // 打开日志目录
  async openLogDir() {
    try {
      if (!existsSync(this.logDir)) {
        return { success: false, message: '日志目录不存在' }
      }

      await shell.openPath(this.logDir)
      return { success: true }
    } catch (error) {
      console.error('打开日志目录失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '打开日志目录失败'
      }
    }
  }
}
