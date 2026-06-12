/**
 * 连接协议 - 策略注册表
 * 新增协议只需：1) 创建策略文件 2) 在此注册
 */
import type { ConnectionFormData, ProtocolType } from './base'
import { TelnetStrategy } from './telnet'
import { SshStrategy } from './ssh'
import { ComStrategy } from './com'
import { FtpStrategy } from './ftp'
import { TcpStrategy } from './tcp'
import { UdpStrategy } from './udp'
import { PingStrategy } from './ping'
import { TftpStrategy } from './tftp'
import { HttpStrategy } from './http'

export type ProtocolStrategy = {
  createDefault(): ConnectionFormData
  fromRaw(raw: any): ConnectionFormData
}

// 协议注册表
const registry = new Map<string, ProtocolStrategy>()

function registerStrategy(type: string, strategy: ProtocolStrategy) {
  registry.set(type, strategy)
}

export function getProtocolStrategy(type: string): ProtocolStrategy {
  const strategy = registry.get(type)
  if (!strategy) {
    console.warn(`未注册的协议类型: ${type}，回退到 telnet`)
    return registry.get('telnet')!
  }
  return strategy
}

/** 创建指定协议的默认表单数据 */
export function createDefaultConnection(type: string): ConnectionFormData {
  return getProtocolStrategy(type).createDefault()
}

/** 从原始数据还原为类型安全的连接对象 */
export function fromRawConnection(raw: any): ConnectionFormData {
  const type = raw?.connectionType || 'telnet'
  return getProtocolStrategy(type).fromRaw(raw)
}

// ===== 注册所有协议 =====
registerStrategy('telnet', TelnetStrategy)
registerStrategy('ssh', SshStrategy)
registerStrategy('com', ComStrategy)
registerStrategy('ftp', FtpStrategy)
registerStrategy('tcp', TcpStrategy)
registerStrategy('udp', UdpStrategy)
registerStrategy('ping', PingStrategy)
registerStrategy('tftp', TftpStrategy)
registerStrategy('http', HttpStrategy)

// 重新导出所有类型和守卫
export * from './base'
