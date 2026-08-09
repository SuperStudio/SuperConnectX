/**
 * 虚拟串口工具函数（渲染进程侧）
 * 与 src/main/entity/VirtualPort.ts 中的 isProperPortName 保持一致
 */

/** 校验端口名格式：必须以 COM 开头 + 正整数（COM1, COM2, ...） */
export function isProperPortName(name: string): boolean {
  if (!name || name.length <= 3) return false
  const upper = name.toUpperCase()
  if (!upper.startsWith('COM')) return false
  const numStr = upper.substring(3)
  const num = parseInt(numStr, 10)
  return num > 0 && num.toString() === numStr
}
