/** 写入 endpoint 发现文件并由 `get_info` 返回的当前应用实例标识。 */
export interface InstanceInfo {
  instanceId: string
  pid: number
  instanceIndex: number
  appVersion: string
  endpoint: string
}
