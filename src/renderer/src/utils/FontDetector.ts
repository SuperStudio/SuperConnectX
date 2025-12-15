const isPageVisible = () => {
  return document.visibilityState === 'visible'
}

const waitForPageVisible = () => {
  return new Promise((resolve) => {
    if (isPageVisible()) {
      resolve()
    } else {
      const listener = () => {
        if (isPageVisible()) {
          document.removeEventListener('visibilitychange', listener)
          resolve()
        }
      }
      document.addEventListener('visibilitychange', listener)
    }
  })
}

export const formatFontName = (fontName) => {
  const fontNameMap = {
    SimSun: '宋体',
    SimHei: '黑体',
    'Microsoft YaHei': '微软雅黑',
    'Microsoft JhengHei': '微软正黑',
    'PingFang SC': '苹方-简',
    'PingFang TC': '苹方-繁',
    'Source Han Sans SC': '思源黑体-简',
    'Source Han Serif SC': '思源宋体-简',
    'Source Han Mono': '思源等宽',
    'WenQuanYi Micro Hei': '文泉驿微米黑',
    'WenQuanYi Micro Hei Mono': '文泉驿等宽微米黑',
    FangSong: '仿宋',
    KaiTi: '楷体'
  }
  return fontNameMap[fontName] || fontName
}

export const getSystemFonts = async () => {
  const defaultFonts = [
    'Consolas',
    'Fira Code',
    'Monaco',
    'Courier New',
    'Roboto Mono',
    'Source Code Pro',
    'Menlo',
    'Ubuntu Mono',
    'Noto Mono',
    'SimHei',
    'Microsoft YaHei Mono',
    'PingFang SC',
    'WenQuanYi Micro Hei Mono',
    'Arial',
    'Helvetica',
    'Times New Roman',
    'Microsoft YaHei',
    'SimSun'
  ]

  try {
    await waitForPageVisible()
    const localFonts = await window.queryLocalFonts()
    const fontNames = [...new Set(localFonts.map((font) => font.family))]
    return [...new Set([...fontNames, ...defaultFonts])].sort()
  } catch (error) {
    console.error('获取系统字体失败：', error)
    return defaultFonts
  }
}
