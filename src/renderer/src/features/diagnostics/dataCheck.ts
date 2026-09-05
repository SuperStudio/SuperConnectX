/**
 * 诊断数据校验域：数据校验（CRC 等 100+ 算法）客户端封装。
 * 通过 preload 暴露的 window.dataCheckApi 与主进程 DataCheckEngine 通信。
 * 统一收敛校验调用，供终端、快捷命令等业务域复用。
 */
import { hexToBinaryString } from './hex'

export interface CrcPlugin {
  name: string
  type: string
}

/** 旧 CRC 方法名 → 新算法名迁移映射（历史持久化数据兼容） */
const CRC_MIGRATION_MAP: Record<string, string> = {
  crc8: 'CRC-8/ITU',
  crc16modbus: 'CRC-16/MODBUS',
  crc16ccitt: 'CRC-16/CCITT-FALSE',
  crc32: 'CRC-32'
}

/** 将旧版保存的 CRC 方法名迁移为新算法名；未知值原样返回 */
export function migrateCrcMethod(name: string): string {
  return CRC_MIGRATION_MAP[name] || name
}

/** 动态加载全部可用校验算法插件 */
export async function loadCrcPlugins(): Promise<CrcPlugin[]> {
  return window.dataCheckApi.getPlugins()
}

/** 请求主进程执行校验，返回 HEX 结果字符串；失败返回 null（不抛出） */
export async function requestCrcHex(method: string, hexInput: string): Promise<string | null> {
  try {
    const result = await window.dataCheckApi.checkData(method, hexInput)
    return result.hexResult
  } catch {
    return null
  }
}

/** 请求主进程执行校验，返回可直接拼接发送的二进制字符串；失败返回 null */
export async function requestCrcBinary(method: string, hexInput: string): Promise<string | null> {
  const hex = await requestCrcHex(method, hexInput)
  return hex === null ? null : hexToBinaryString(hex)
}
