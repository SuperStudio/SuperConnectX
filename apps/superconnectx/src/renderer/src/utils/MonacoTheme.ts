/**
 * Monaco Editor 主题工具
 * 根据 data-theme 属性自动返回对应的 Monaco 内置主题名
 */

export function getMonacoTheme(): string {
  const theme = document.documentElement.getAttribute('data-theme')
  return theme === 'light' ? 'vs' : 'vs-dark'
}
