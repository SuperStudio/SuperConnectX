import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface AppLogger {
  debug(message: string, ...meta: unknown[]): void
  info(message: string, ...meta: unknown[]): void
  warn(message: string, ...meta: unknown[]): void
  error(message: string, ...meta: unknown[]): void
}

export interface LoggerOptions {
  logDir: string
  level?: LogLevel
  isTTY?: boolean
  maxSize?: string
  maxFiles?: string
  errorMaxFiles?: string
}

export interface LoggerService {
  logger: AppLogger
  logDir: string
}

/**
 * 创建与 Electron 生命周期无关的应用日志服务。
 * IPC 注册和未捕获异常处理由调用方决定，以便在不同应用中按需启用。
 */
export function createLoggerService(options: LoggerOptions): LoggerService {
  const level = options.level ?? 'info'
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level: entryLevel, message, ...meta }) =>
      `${timestamp} [${entryLevel.toUpperCase()}]: ${message} ${
        Object.keys(meta).length ? JSON.stringify(meta) : ''
      }`
    )
  )

  const consoleFormats = options.isTTY ? [winston.format.colorize(), logFormat] : [logFormat]
  const logger = winston.createLogger({
    level,
    transports: [
      new winston.transports.Console({ format: winston.format.combine(...consoleFormats) }),
      new DailyRotateFile({
        filename: path.join(options.logDir, 'app-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: options.maxSize ?? '20m',
        maxFiles: options.maxFiles ?? '14d',
        level,
        format: logFormat
      }),
      new DailyRotateFile({
        filename: path.join(options.logDir, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: options.maxSize ?? '20m',
        maxFiles: options.errorMaxFiles ?? '30d',
        level: 'error',
        format: logFormat
      })
    ]
  })

  return { logger, logDir: options.logDir }
}
