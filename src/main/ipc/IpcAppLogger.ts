import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { join } from 'path'

const exePath = app.isPackaged ? app.getPath('exe') : process.cwd()
const appDir = path.dirname(exePath)
const LOG_DIR = join(appDir, 'app-logs')

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

// 日志级别（优先级：error > warn > info > debug > silly）
const LOG_LEVEL = process.env.NODE_ENV === 'development' ? 'debug' : 'info'

// 日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // 时间戳
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // 拼接日志内容：时间 + 级别 + 消息 + 元数据
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${
      Object.keys(meta).length ? JSON.stringify(meta) : ''
    }`
  })
)

// 定义日志传输方式（控制台 + 文件）
const transports = [
  // 控制台输出（开发环境）
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), logFormat) // 控制台带颜色
  }),
  // 按日期分割的文件输出（所有环境）
  new DailyRotateFile({
    filename: path.join(LOG_DIR, 'app-%DATE%.log'), // 日志文件名格式
    datePattern: 'YYYY-MM-DD', // 按天分割
    maxSize: '20m', // 单个文件最大 20MB
    maxFiles: '14d', // 保留 14 天的日志
    level: LOG_LEVEL,
    format: logFormat
  }),
  // 单独的错误日志文件（可选）
  new DailyRotateFile({
    filename: path.join(LOG_DIR, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d', // 错误日志保留更久
    level: 'error', // 只记录 error 级别
    format: logFormat
  })
]

// 创建日志实例
const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports
})

// 封装日志方法（简化调用）
export const log = {
  debug: (message: string, meta?: any) => logger.debug(message, meta),
  info: (message: string, meta?: any) => logger.info(message, meta),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  error: (message: string, meta?: any) => logger.error(message, meta),
  // 暴露日志目录（供渲染进程使用）
  logDir: LOG_DIR
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
