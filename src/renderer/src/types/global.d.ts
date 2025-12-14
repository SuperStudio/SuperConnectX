// 扩展 Window 接口，声明 storageApi 的类型
declare global {
  interface Window {
    storageApi: {
      // 获取所有连接
      getConnections: () => Array<{
        id: number
        name: string
        type: 'telnet' | 'ssh' // 协议类型仅允许 telnet/ssh
        host: string // IP 地址或域名
        port: number // 端口（1-65535）
        username?: string // 用户名（可选）
        password?: string // 密码（可选，预留）
      }>
      // 添加新连接
      addConnection: (conn: {
        name: string
        type: 'telnet' | 'ssh'
        host: string
        port: number
        username?: string
        password?: string
      }) => {
        id: number
        name: string
        type: 'telnet' | 'ssh'
        host: string
        port: number
        username?: string
        password?: string
      }
      // 删除连接
      deleteConnection: (id: number) => Array<{
        id: number
        name: string
        type: 'telnet' | 'ssh'
        host: string
        port: number
        username?: string
        password?: string
      }>
      getPresetCommands: () => Array<{
        id: number
        name: string
        command: string
        delay: number
      }>
      addPresetCommand: (cmd: { name: string; command: string; delay: number }) => {
        id: number
        name: string
        command: string
        delay: number
      }
      updatePresetCommand: (cmd: { id: number; name: string; command: string; delay: number }) => {
        id: number
        name: string
        command: string
        delay: number
      }
      deletePresetCommand: (id: number) => Array<{
        id: number
        name: string
        command: string
        delay: number
      }>
    }
  }
}

// 必须添加这行，确保类型声明文件被 TS 识别
export {}
