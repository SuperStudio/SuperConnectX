import fs from 'fs'
import path from 'path'

const SAVE_DIR_NAME = 'userdata'
const FILE_NAME = 'ssh-known-hosts.json'

interface KnownHostEntry {
  /** 主机密钥指纹，形如 SHA256:xxxx base64（去尾部 =） */
  fingerprint: string
  /** 首次记录时间 */
  firstSeen: number
}

/** host:port -> 已授信的主机指纹记录 */
type KnownHostMap = Record<string, KnownHostEntry>

/**
 * SSH 主机密钥指纹存储（等价 OpenSSH 的 known_hosts）
 *
 * 数据落在 `<appDataDir>/userdata/ssh-known-hosts.json`，键为 `host:port`。
 * 用于 hostVerifier 校验：首次连接自动记录指纹（TOFU），
 * 之后指纹变更则拒绝连接，防止中间人攻击。
 *
 * 注意：本类运行在主进程与 Worker 线程中，因此【禁止】依赖 electron /
 * electron-store（Worker 中 require('electron') 会直接崩溃），
 * 路径由调用方显式传入。
 */
export default class SshKnownHostsStorage {
  private readonly filePath: string

  /**
   * @param appDataDir 应用数据根目录（即 getAppDataDir() 的返回值）
   */
  constructor(appDataDir: string) {
    const userDataPath = path.join(appDataDir, SAVE_DIR_NAME)
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }
    this.filePath = path.join(userDataPath, FILE_NAME)
  }

  /** 生成 known_hosts 的键（默认端口 22） */
  static buildKey(host: string, port?: number): string {
    return `${host}:${port || 22}`
  }

  private all(): KnownHostMap {
    try {
      if (!fs.existsSync(this.filePath)) return {}
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
      return (raw && raw.hosts) || {}
    } catch {
      // 文件损坏时不阻断连接，返回空表示“全部重新走首次信任流程”
      return {}
    }
  }

  private save(hosts: KnownHostMap): void {
    fs.writeFileSync(this.filePath, JSON.stringify({ hosts }, null, 2), 'utf-8')
  }

  getFingerprint(host: string, port?: number): string | null {
    return this.all()[SshKnownHostsStorage.buildKey(host, port)]?.fingerprint ?? null
  }

  /** 记录/更新指定主机的指纹（首次连接信任） */
  trust(host: string, port: number | undefined, fingerprint: string): void {
    const hosts = this.all()
    hosts[SshKnownHostsStorage.buildKey(host, port)] = {
      fingerprint,
      firstSeen: Date.now()
    }
    this.save(hosts)
  }

  /** 删除某主机的指纹记录（更换密钥后让用户可重新信任） */
  remove(host: string, port?: number): void {
    const hosts = this.all()
    delete hosts[SshKnownHostsStorage.buildKey(host, port)]
    this.save(hosts)
  }
}
