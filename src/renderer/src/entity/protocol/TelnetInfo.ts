/**
 * @deprecated 请使用 '@/entity/protocol' 中的 createDefaultConnection / fromRawConnection
 * 此文件仅为向后兼容保留
 */
import { createDefaultConnection, fromRawConnection } from './index'
import type { ConnectionFormData } from './index'

export type { ConnectionFormData }

/** @deprecated 使用 createDefaultConnection('telnet') 代替 */
export default class TelnetInfo {
  static build(): ConnectionFormData {
    return createDefaultConnection('telnet')
  }

  static buildWithValue(conn: any): ConnectionFormData {
    return fromRawConnection(conn)
  }
}
