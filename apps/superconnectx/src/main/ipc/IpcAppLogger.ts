import { ipcMain } from 'electron'
import fs from 'fs'
import { join } from 'path'
import { getAppDataDir } from '../utils/AppDir'
import { createLoggerService } from '../../core/logging/LoggerService'

// 使用智能路径：exe 同目录（非系统盘有权限）或 userData（回退）
const LOG_DIR = join(getAppDataDir(), 'app-logs')

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

// 日志级别（优先级：error > warn > info > debug > silly）
const LOG_LEVEL = process.env.NODE_ENV === 'development' ? 'debug' : 'info'

// 核心服务保持 Electron/IPC 无关；本文件只保留现有应用的兼容 API 与 IPC 注册。
const { logger, logDir } = createLoggerService({
  logDir: LOG_DIR,
  level: LOG_LEVEL,
  isTTY: process.stdout.isTTY
})

// 封装日志方法（简化调用）
export const log = {
  debug: (message: string, meta?: any) => logger.debug(message, meta),
  info: (message: string, meta?: any) => logger.info(message, meta),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  error: (message: string, meta?: any) => logger.error(message, meta),
  // 暴露日志目录（供渲染进程使用）
  logDir
}

// 主进程未捕获异常处理
process.on('uncaughtException', (err) => {
  log.error('Uncaught Exception:', { error: err.stack })
})

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection at:', {
    promise,
    reason: reason instanceof Error ? reason.stack : reason
  })
})

// 注册 IPC 日志事件（主进程接收渲染进程的日志请求）
ipcMain.handle('logger:debug', (_, message: string, meta?: any) => {
  log.debug(message, meta)
})
ipcMain.handle('logger:info', (_, message: string, meta?: any) => {
  log.info(message, meta)
})
ipcMain.handle('logger:warn', (_, message: string, meta?: any) => {
  log.warn(message, meta)
})
ipcMain.handle('logger:error', (_, message: string, meta?: any) => {
  log.error(message, meta)
})

// 暴露日志目录给渲染进程
ipcMain.handle('logger:getLogDir', () => {
  return log.logDir
})

export default logger
