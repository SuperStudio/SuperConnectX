import { appendFile, existsSync, mkdirSync } from 'fs'
import { shell } from 'electron'
import fs from 'fs'
import { join } from 'path'

export default class logger {
  logDir

  constructor(userDir) {
    this.logDir = join(userDir, 'logs')
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true })
    }
  }

  getLogFileName() {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.log`
  }

  writeToLog(data: string) {
    const logFile = join(this.logDir, this.getLogFileName())
    appendFile(logFile, data, (err) => {
      if (err) {
        console.error('写入日志失败:', err)
      }
    })
  }

  async openLogDir() {
    try {
      const logFileName = this.getLogFileName()
      const logFilePath = join(this.logDir, logFileName)
      console.log('尝试打开日志文件：', logFilePath)
      if (!existsSync(this.logDir)) {
        return { success: false, message: '日志目录不存在' }
      }
      if (!existsSync(logFilePath)) {
        await fs.promises.writeFile(logFilePath, '', 'utf-8')
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
}
