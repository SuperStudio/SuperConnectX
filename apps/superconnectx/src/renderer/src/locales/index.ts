import { createI18n } from 'vue-i18n'
import zhCN from './lang/zh-CN.json'
import enUS from './lang/en-US.json'

export type LocaleType = 'zh-CN' | 'en-US'

export const availableLocales: { value: LocaleType; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' }
]

// 从 localStorage 获取保存的语言设置
const getSavedLocale = (): LocaleType => {
  const saved = localStorage.getItem('locale')
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  // 根据浏览器语言自动选择
  const browserLang = navigator.language
  if (browserLang.startsWith('zh')) {
    return 'zh-CN'
  }
  return 'en-US'
}

export const i18n = createI18n({
  legacy: false,
  locale: getSavedLocale(),
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
})

// 保存语言设置到 localStorage
export const setLocale = (locale: LocaleType) => {
  localStorage.setItem('locale', locale)
  i18n.global.locale.value = locale
}
