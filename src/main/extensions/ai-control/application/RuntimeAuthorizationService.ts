import type { AiPermission } from '../../../../shared/extensions/ai-control/AiConfigTypes'

/**
 * AI 写权限的运行时闸门。
 *
 * 权限只保存在主进程内存中，不读取也不写入 ai-bridge.json。
 * 每次进程启动都会创建新实例，因此初始权限必定为只读；只有本地页面 IPC
 * 可以在本次运行期间切换为完全控制。
 */
export default class RuntimeAuthorizationService {
  private permission: AiPermission = 'read-only'

  getPermission(): AiPermission {
    return this.permission
  }

  setPermission(permission: AiPermission): void {
    this.permission = permission
  }

  reset(): void {
    this.permission = 'read-only'
  }
}
