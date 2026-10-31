import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  SETTINGS_GROUPS,
  SETTINGS_INDEX,
  searchSettings,
  type TranslateFn
} from '@/renderer/src/features/settings/settingsIndex'

const PAGE_PATH = resolve(__dirname, '../../apps/superconnectx/src/renderer/src/components/SettingsPage.vue')
const ZH_PATH = resolve(__dirname, '../../apps/superconnectx/src/renderer/src/locales/lang/zh-CN.json')
const EN_PATH = resolve(__dirname, '../../apps/superconnectx/src/renderer/src/locales/lang/en-US.json')

/** 受控词典，让匹配逻辑测试不依赖真实文案的措辞变化 */
const dict: Record<string, string> = {
  'basicSettings.language': '界面语言',
  'basicSettings.minimizeToTray': '关闭后最小化到托盘',
  'basicSettings.maxDisplayText': '可显示最大文本',
  'basicSettings.maxDisplayTextDesc': '超过后自动清理最早内容',
  'basicSettings.autoCheckUpdate': '自动检测更新',
  'basicSettings.autoCheckUpdateDesc': '启动时检查新版本',
  'basicSettings.notificationDuration': '通知显示时长',
  'basicSettings.notificationDurationDesc': '通知自动消失的时间',
  'logSettings.logSplit': '日志分片',
  'logSettings.logSplitDesc': '按大小自动拆分日志文件',
  'logSettings.cleanupNow': '立即清理',
  'logSettings.cleanupNowDesc': '删除过期的日志文件',
  'serialSettings.supportedBaudRates': '支持的波特率列表',
  'mcpSettings.token': 'Bearer Token',
  'mcpSettings.tokenDesc': '调用 MCP 服务使用的令牌',
  'settingsNav.syntax': '语法高亮'
}
const t: TranslateFn = (key) => dict[key] ?? key

describe('settingsIndex - searchSettings', () => {
  it('空关键词视为未进入搜索态', () => {
    const result = searchSettings('', t)
    expect(result.hits).toHaveLength(0)
    expect(result.visibleIds.size).toBe(0)
    expect(searchSettings('   ', t).hits).toHaveLength(0)
  })

  it('按中文标题命中', () => {
    const result = searchSettings('托盘', t)
    expect(result.hits[0].entry.id).toBe('basic.minimizeToTray')
    expect(result.hits[0].field).toBe(1)
  })

  it('按英文别名命中', () => {
    expect(searchSettings('tray', t).hits[0].entry.id).toBe('basic.minimizeToTray')
    expect(searchSettings('baud', t).hits[0].entry.id).toBe('serial.supportedBaudRates')
  })

  it('英文匹配大小写不敏感', () => {
    expect(searchSettings('TOKEN', t).hits[0].entry.id).toBe('mcp.token')
    expect(searchSettings('Token', t).hits[0].entry.id).toBe('mcp.token')
  })

  it('仅描述命中时标记为 field 2', () => {
    const result = searchSettings('自动清理', t)
    const hit = result.hits.find((h) => h.entry.id === 'basic.maxDisplayText')
    expect(hit?.field).toBe(2)
  })

  it('标题命中优先于描述命中', () => {
    const result = searchSettings('清理', t)
    expect(result.hits[0].entry.id).toBe('log.cleanupNow') // 标题命中
    expect(result.hits.find((h) => h.entry.id === 'basic.maxDisplayText')?.field).toBe(2)
  })

  it('visibleIds 同时包含命中项与其所属分组', () => {
    const result = searchSettings('托盘', t)
    expect(result.visibleIds.has('basic.minimizeToTray')).toBe(true)
    expect(result.visibleIds.has('basic.config')).toBe(true)
  })

  it('未命中任何内容时返回空结果', () => {
    expect(searchSettings('这个词肯定不存在zzz', t).hits).toHaveLength(0)
  })

  it('同一设置项只出现一次', () => {
    const result = searchSettings('日志', t)
    const ids = result.hits.map((h) => h.entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('settingsIndex - 索引完整性（防漂移）', () => {
  const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf-8'))
  const zh = readJson(ZH_PATH)
  const en = readJson(EN_PATH)

  const hasKey = (lang: Record<string, Record<string, string>>, i18nKey: string) => {
    const [scope, leaf] = i18nKey.split('.')
    return Boolean(lang[scope]?.[leaf])
  }

  it('id 全局唯一', () => {
    const ids = SETTINGS_INDEX.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('group 都存在于分组清单（语法高亮等整块区域允许留空）', () => {
    const groupIds = new Set(SETTINGS_GROUPS.map((g) => g.id))
    for (const entry of SETTINGS_INDEX) {
      if (!entry.group) continue
      expect(groupIds.has(entry.group), `${entry.id} 的 group 未登记: ${entry.group}`).toBe(true)
    }
  })

  it('labelKey / descKey 在中文与英文语言包中均可解析', () => {
    for (const entry of SETTINGS_INDEX) {
      expect(hasKey(zh, entry.labelKey), `zh 缺失 ${entry.labelKey}`).toBe(true)
      expect(hasKey(en, entry.labelKey), `en 缺失 ${entry.labelKey}`).toBe(true)
      if (entry.descKey) {
        expect(hasKey(zh, entry.descKey), `zh 缺失 ${entry.descKey}`).toBe(true)
        expect(hasKey(en, entry.descKey), `en 缺失 ${entry.descKey}`).toBe(true)
      }
    }
  })

  it('SettingGroup 的 titleKey 在两种语言中均可解析', () => {
    for (const group of SETTINGS_GROUPS) {
      expect(hasKey(zh, group.titleKey), `zh 缺失 ${group.titleKey}`).toBe(true)
      expect(hasKey(en, group.titleKey), `en 缺失 ${group.titleKey}`).toBe(true)
    }
  })
})

describe('settingsIndex - 与 SettingsPage 模板一致', () => {
  const template = readFileSync(PAGE_PATH, 'utf-8')
  const collect = (re: RegExp) =>
    Array.from(template.matchAll(re)).map((m) => m[1])

  it('模板里的 SettingItem id 与索引完全对应', () => {
    // 区域级块（如嵌入的语法高亮页）用 isSettingVisible('x') 直接控制，也算已登记
    const regionIds = collect(/isSettingVisible\('([^']+)'\)/g)
    const inTemplate = new Set([
      ...collect(/<SettingItem\b[^>]*\bid="([^"]+)"/g),
      ...regionIds
    ])
    const inIndex = new Set(SETTINGS_INDEX.map((e) => e.id))
    expect([...inTemplate].filter((id) => !inIndex.has(id))).toEqual([])
    expect([...inIndex].filter((id) => !inTemplate.has(id))).toEqual([])
  })

  it('模板里的 SettingGroup id 与分组清单完全对应', () => {
    const inTemplate = new Set(collect(/<SettingGroup\b[^>]*\bid="([^"]+)"/g))
    const inIndex = new Set(SETTINGS_GROUPS.map((g) => g.id))
    expect([...inTemplate].filter((id) => !inIndex.has(id))).toEqual([])
    expect([...inIndex].filter((id) => !inTemplate.has(id))).toEqual([])
  })

  it('follow 必须指向已登记的设置项', () => {
    const follows = collect(/<SettingItem\b[^>]*\bfollow="([^"]+)"/g)
    const inIndex = new Set(SETTINGS_INDEX.map((e) => e.id))
    for (const target of follows) {
      expect(inIndex.has(target), `follow 指向不存在的设置项: ${target}`).toBe(true)
    }
  })

  it('每个设置项都配置了别名，便于跨语言搜索', () => {
    for (const entry of SETTINGS_INDEX) {
      expect(entry.keywords?.length, `${entry.id} 缺少 keywords`).toBeGreaterThan(0)
    }
  })
})
