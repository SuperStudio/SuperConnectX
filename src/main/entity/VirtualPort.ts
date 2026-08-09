/**
 * VirtualPort - 虚拟串口对中的一个端口
 *
 * 对应 com0com (Null-modem emulator) 的 setupc.exe 中每个端口配置。
 *
 * setupc.exe list 输出格式示例：
 *   CNCA0 PortName=COM2,EmuBR=yes,EmuOverrun=yes
 *   CNCB0 PortName=COM4,EmuBR=yes,EmuOverrun=yes
 *
 * 常用 setupc 命令：
 *   install - -                    安装一对自动命名的串口
 *   install PortName=COM2 PortName=COM4  安装指定名称的串口对
 *   remove 0                       删除第 0 对串口
 *   change CNCA0 EmuBR=yes,EmuOverrun=yes  修改端口配置
 *   list                           列出所有串口对
 *   uninstall                      卸载驱动
 */
export default class VirtualPort {
  /** 端口 ID，如 CNCA0、CNCB1 */
  ID: string = ''

  /** 端口名称，如 COM2、COM4 */
  Name: string = ''

  /** 启用/禁用波特率仿真（默认禁用） */
  EmuBR: boolean = false

  /** 启用/禁用缓冲区溢出（默认禁用） */
  EmuOverrun: boolean = false

  /** 错误概率，范围 0-0.99999999，每个字符帧的误码概率（默认 0） */
  EmuNoise: number = 0

  /** 读操作超时增加 n 毫秒（默认 0） */
  AddRTTO: number = 0

  /** 读操作字符间隔超时增加 n 毫秒（默认 0） */
  AddRITO: number = 0

  /** 启用/禁用插件模式（插件模式端口在配对端口未打开时隐藏，默认禁用） */
  PlugInMode: boolean = false

  /** 启用/禁用独占模式（独占模式端口打开时隐藏，默认禁用） */
  ExclusiveMode: boolean = false

  /** 启用/禁用隐藏模式（隐藏模式端口尽可能对枚举器隐藏，默认禁用） */
  HiddenMode: boolean = false

  constructor(name?: string) {
    if (name) {
      this.Name = name
    }
  }

  /** 最大允许的噪声值 */
  static readonly MAX_EMU_NOISE = 0.99999999

  /** 最大允许的毫秒值（int 上限） */
  static readonly MAX_MS_VALUE = 2147483647

  /**
   * 检查端口名称是否合法
   * 必须以 COM 开头，后跟正整数的端口号
   */
  static isProperPortName(name: string): boolean {
    if (!name || !name.toUpperCase().startsWith('COM')) {
      return false
    }
    const portNumber = parseInt(name.toUpperCase().trim().replace('COM', ''), 10)
    return !isNaN(portNumber) && portNumber > 0 && portNumber < Number.MAX_SAFE_INTEGER
  }

  /**
   * 检查端口数值参数是否合法
   */
  static isProperNumber(port: VirtualPort): boolean {
    if (!port) return false
    if (port.AddRITO < 0 || port.AddRITO > VirtualPort.MAX_MS_VALUE) return false
    if (port.AddRTTO < 0 || port.AddRTTO > VirtualPort.MAX_MS_VALUE) return false
    if (port.EmuNoise < 0 || port.EmuNoise > VirtualPort.MAX_EMU_NOISE) return false
    return true
  }

  /**
   * 生成 setupc.exe change 命令的参数字符串
   * 格式: PortName=COM2,EmuBR=yes,EmuOverrun=yes,...
   */
  toUpdateString(): string {
    const parts: string[] = []
    const props = Object.getOwnPropertyNames(this) as (keyof VirtualPort)[]

    for (const key of props) {
      if (key === 'ID') continue

      const value = this[key]
      if (value === undefined || value === null) continue

      let str: string
      if (typeof value === 'boolean') {
        str = value ? 'yes' : 'no'
      } else {
        str = String(value)
      }

      if (key === 'Name') {
        parts.push(`PortName=${str}`)
      } else {
        parts.push(`${key}=${str}`)
      }
    }

    return parts.join(',')
  }

  /**
   * 判断两个 VirtualPort 是否相等（属性值比较）
   */
  equals(other: VirtualPort | null): boolean {
    if (!other) return false

    const props = Object.getOwnPropertyNames(this) as (keyof VirtualPort)[]
    for (const key of props) {
      const thisVal = this[key]
      const otherVal = other[key]
      if (thisVal !== otherVal) return false
    }
    return true
  }
}
