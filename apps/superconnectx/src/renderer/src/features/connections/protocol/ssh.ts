import type { SshConnection } from './base'

export const SshStrategy = {
  createDefault(): SshConnection {
    return {
      name: '',
      connectionType: 'ssh',
      host: '',
      port: 22,
      username: '',
      password: '',
      authMethod: 'password',
      privateKeyPath: '',
      passphrase: '',
      // SSH 是交互式 shell 会话，默认直接进入终端模式
      terminalMode: true
    }
  },

  fromRaw(raw: any): SshConnection {
    return {
      id: raw.id,
      name: raw.name || '',
      connectionType: 'ssh',
      host: raw.host || '',
      port: raw.port || 22,
      username: raw.username || '',
      password: raw.password || '',
      authMethod: raw.authMethod === 'key' ? 'key' : 'password',
      privateKeyPath: raw.privateKeyPath || '',
      passphrase: raw.passphrase || '',
      // 历史连接没有该字段时按 SSH 默认（终端模式）处理，仅显式存 false 才是日志视图
      terminalMode: raw.terminalMode !== false
    }
  }
}
