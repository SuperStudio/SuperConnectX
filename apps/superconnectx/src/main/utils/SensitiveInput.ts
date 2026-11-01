/**
 * 敏感输入脱敏工具
 *
 * 背景：协议日志会把用户发送的每一条内容原样落盘（`SEND >>>>>>>>>> xxx`），
 * 终端模式下 xterm 的每个按键也会走同一条链路。这意味着用户在终端里
 * 输入的 sudo 密码、`mysql -p` 密码、`passwd` 新密码等会被明文写入日志文件，
 * 且日志支持分片与导出，明文会随备份一起扩散。
 *
 * 本工具提供两层防护：
 *   1. 静态特征：命令本身携带凭据（如 `--password=xxx`、`mysql -p123456`）
 *   2. 动态窗口：远端刚打印过密码提示，其后的输入默认视为敏感内容
 *      （终端模式下密码是逐字发送的，单看一段输入无法判断，必须结合上下文）
 */

export const SENSITIVE_MASK = '***'

/** 密码提示出现后，多久内的输入视为敏感（毫秒） */
export const SENSITIVE_WINDOW_MS = 60_000

/** 命令中疑似携带凭据的静态特征 */
const CREDENTIAL_PATTERNS: RegExp[] = [
  // sudo -S：密码从标准输入传入
  /\b(?:sudo|su)\b[\s\S]*?\s-S\b/i,
  // sshpass -p 密码 / -f 密码文件
  /\bsshpass\b[\s\S]*?\s-(?:p|f)\b/i,
  // 改密类命令
  /\b(?:passwd|chpasswd|smbpasswd|htpasswd)\b/i,
  // --password=xxx / -p:xxx / token:xxx
  /-{1,2}(?:password|passwd|pwd|secret|token|api[-_]?key)\s*[=:]\s*\S+/i,
  // mysql -p密码（紧跟无空格才是密码形式，避免误伤 `mkdir -p /x`）
  /\b(?:mysql|mysqldump|mysqladmin|psql|mongo|mongosh)\w*\b[\s\S]*?\s-p\S+/i,
  // curl -u user:pass / svn --username a --password b 中的 user:pass 形式
  /\b(?:curl|wget|svn|git|ftp|sftp|lftp)\b[\s\S]*?\s-{1,2}u(?:ser(?:name)?)?\s+\S*:\S+/i,
  // password = xxx / password:xxx（配置项或交互输入回显）
  /\b(?:password|passwd|passphrase)\s*[=:]\s*\S+/i,
  // 环境变量形式：PGPASSWORD=xxx / MYSQL_PWD=xxx / API_TOKEN=xxx
  /\b\w*(?:PASSWORD|PASSWD|PASSPHRASE|SECRET|TOKEN|API_?KEY)\w*\s*=\s*\S+/
]

/** 远端输出中提示"接下来要输密码"的特征 */
const PROMPT_PATTERNS: RegExp[] = [
  /\[sudo\]\s*password\s*for/i,
  /\bpassword\s*for\s+\S+\s*[:：]/i,
  /\b(?:enter\s+)?(?:user\s+|root\s+)?password\s*[:：]\s*$/i,
  /\bpassphrase\s*for\b[\s\S]*[:：]\s*$/i,
  /\b(?:current|old|new|retype)\s+(?:unix\s+)?password\b/i,
  /\benter\s+(?:your\s+)?(?:password|passphrase)\b/i,
  /\bpassword\s*[:：]\s*$/i
]

/**
 * 判断一段内容是否疑似携带凭据。
 * 返回 true 时调用方应记录掩码而非原文。
 */
export function looksLikeCredential(text: string): boolean {
  if (!text) return false
  return CREDENTIAL_PATTERNS.some((re) => re.test(text))
}

/**
 * 判断"尚未输完的一行"是否正在走向凭据输入。
 *
 * 终端模式下 xterm 是逐字发送的，服务端日志里每条记录只有一个字符，
 * 单看一条永远匹配不到完整特征（`-p123456` 被拆成 `-p`、`1`、`2`...）。
 * 因此必须把同一行内已输入的片段拼起来，判断它是否已经进入
 * "命令名是 mysql/passwd/... 或已经出现 -p 这类密码参数"的状态，
 * 一旦进入，该行剩余输入全部按敏感处理。
 */
export function looksLikeCredentialPrefix(partial: string): boolean {
  if (!partial) return false
  return (
    // 命令名本身就是凭据相关命令
    /^\s*(?:mysql|mysqldump|mysqladmin|psql|mongo|mongosh|sshpass|passwd|chpasswd|smbpasswd|htpasswd)\b/i.test(
      partial
    ) ||
    // 已经输入了 -p 且后面紧跟内容（密码形式），后续字符都是密码的一部分
    /\s-p\S*$/.test(partial) ||
    // 已经输入了 --password= 且后面紧跟内容
    /-{1,2}(?:password|passwd|pwd|secret|token|api[-_]?key)\s*[=:]\s*\S*$/.test(partial) ||
    // sudo -S：后续 stdin 内容即密码
    /\b(?:sudo|su)\b[\s\S]*?\s-S\b/.test(partial) ||
    // curl -u user: 之后的内容即密码
    /\b(?:curl|wget|ftp|sftp|lftp|svn)\b[\s\S]*?\s-{1,2}u(?:ser(?:name)?)?\s+\S*:\S*$/.test(partial)
  )
}

/**
 * 判断远端输出是否包含密码输入提示。
 * 命中后应开启"敏感输入窗口"，窗口内的用户输入全部按敏感处理。
 */
export function looksLikePasswordPrompt(text: string): boolean {
  if (!text) return false
  return PROMPT_PATTERNS.some((re) => re.test(text))
}

/**
 * 对日志/回显用的输入内容做脱敏：
 * 命中凭据特征时整体替换为掩码，否则原样返回。
 */
export function maskSensitiveInput(text: string): string {
  if (!text) return text
  return looksLikeCredential(text) ? SENSITIVE_MASK : text
}
