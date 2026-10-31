/**
 * 设置项索引与搜索
 *
 * 背景：SettingsPage.vue 里 45 个设置项全是手写模板，且用 v-if/v-else-if 一次只挂载
 * 一个分类，运行时既拿不到元数据，也扫不到未挂载分类的 DOM。因此这里补一层声明式
 * 索引，作为「设置项 → 分类 / 分组 / i18n 文案 / 别名」的唯一事实来源。
 *
 * 同名 id 同时写入 DOM 的 data-setting-id，便于过滤组件定位与后续 E2E。
 */

export type SettingCategoryKey =
  | 'basic'
  | 'serial'
  | 'log'
  | 'syntax'
  | 'history'
  | 'backup'
  | 'mcp'

/** 控件类型，仅用于描述与后续扩展（如设置 JSON 编辑），搜索本身不依赖 */
export type SettingControl =
  | 'switch'
  | 'select'
  | 'slider'
  | 'input'
  | 'number'
  | 'action'
  | 'custom'

export interface SettingEntry {
  /** 全局唯一 id，同时作为 DOM 的 data-setting-id */
  id: string
  category: SettingCategoryKey
  /** 所属分组 id（group 无命中时整组隐藏），syntax 等无分组的块留空 */
  group: string
  /** 标题文案 key */
  labelKey: string
  /** 描述文案 key */
  descKey?: string
  /** 同义词/别名，参与匹配但不展示 */
  keywords?: string[]
  control: SettingControl
  /** 是否依赖某个前置开关（如自动备份周期）；true 时命中也不保证可见 */
  conditional?: boolean
  /** 对应的 Settings 字段名，为后续「设置 JSON 编辑」预留 */
  settingKey?: string
}

export interface SettingGroupEntry {
  id: string
  category: SettingCategoryKey
  titleKey: string
}

export interface SearchHit {
  entry: SettingEntry
  /** 命中位置：1=标题 2=描述 3=别名 */
  field: 1 | 2 | 3
}

export type TranslateFn = (key: string) => string

/* ------------------------------------------------------------------ */
/* 分组清单                                                             */
/* ------------------------------------------------------------------ */

export const SETTINGS_GROUPS: SettingGroupEntry[] = [
  { id: 'basic.config', category: 'basic', titleKey: 'basicSettings.title' },
  { id: 'basic.display', category: 'basic', titleKey: 'basicSettings.display' },
  { id: 'serial.general', category: 'serial', titleKey: 'serialSettings.title' },
  { id: 'log.general', category: 'log', titleKey: 'logSettings.title' },
  { id: 'history.general', category: 'history', titleKey: 'historySettings.title' },
  { id: 'backup.create', category: 'backup', titleKey: 'basicSettings.backup' },
  { id: 'backup.restore', category: 'backup', titleKey: 'basicSettings.restore' },
  { id: 'mcp.service', category: 'mcp', titleKey: 'mcpSettings.serviceTitle' },
  { id: 'mcp.access', category: 'mcp', titleKey: 'mcpSettings.accessTitle' },
  { id: 'mcp.skill', category: 'mcp', titleKey: 'mcpSettings.skillTitle' }
]

/* ------------------------------------------------------------------ */
/* 设置项清单                                                           */
/* ------------------------------------------------------------------ */

export const SETTINGS_INDEX: SettingEntry[] = [
  // ---------------- basic / 基本配置 ----------------
  {
    id: 'basic.language',
    category: 'basic',
    group: 'basic.config',
    labelKey: 'basicSettings.language',
    keywords: ['语言', '中文', '英文', 'lang', 'language', 'zh', 'en'],
    control: 'select',
    settingKey: 'language'
  },
  {
    id: 'basic.minimizeToTray',
    category: 'basic',
    group: 'basic.config',
    labelKey: 'basicSettings.minimizeToTray',
    keywords: ['托盘', '最小化', 'tray', 'minimize', '后台'],
    control: 'switch',
    settingKey: 'minimizeToTray'
  },
  {
    id: 'basic.preventSleep',
    category: 'basic',
    group: 'basic.config',
    labelKey: 'basicSettings.preventSleep',
    keywords: ['休眠', '息屏', '睡眠', '屏保', 'sleep', 'powersave'],
    control: 'switch',
    settingKey: 'preventSleep'
  },
  {
    id: 'basic.maxDisplayText',
    category: 'basic',
    group: 'basic.config',
    labelKey: 'basicSettings.maxDisplayText',
    descKey: 'basicSettings.maxDisplayTextDesc',
    keywords: ['内存', '文本上限', '最多显示', '缓冲区', 'buffer'],
    control: 'slider',
    settingKey: 'maxDisplayText'
  },
  {
    id: 'basic.autoCheckUpdate',
    category: 'basic',
    group: 'basic.config',
    labelKey: 'basicSettings.autoCheckUpdate',
    descKey: 'basicSettings.autoCheckUpdateDesc',
    keywords: ['更新', '升级', '检查更新', 'update', 'upgrade'],
    control: 'switch',
    settingKey: 'autoCheckUpdate'
  },

  // ---------------- basic / 显示 ----------------
  {
    id: 'basic.autoScrollToast',
    category: 'basic',
    group: 'basic.display',
    labelKey: 'basicSettings.autoScrollToast',
    keywords: ['滚屏提示', '固定提示', 'toast', 'scroll'],
    control: 'switch',
    settingKey: 'autoScrollToast'
  },
  {
    id: 'basic.notificationDuration',
    category: 'basic',
    group: 'basic.display',
    labelKey: 'basicSettings.notificationDuration',
    descKey: 'basicSettings.notificationDurationDesc',
    keywords: ['通知', '提示时长', '自动消失', 'notification', 'toast'],
    control: 'select',
    settingKey: 'notificationDuration'
  },
  {
    id: 'basic.autoScrollOnFocus',
    category: 'basic',
    group: 'basic.display',
    labelKey: 'basicSettings.autoScrollOnFocus',
    keywords: ['焦点', 'focus', '滚屏'],
    control: 'switch',
    settingKey: 'autoScrollOnFocus'
  },
  {
    id: 'basic.autoScrollAfterSend',
    category: 'basic',
    group: 'basic.display',
    labelKey: 'basicSettings.autoScrollAfterSend',
    descKey: 'basicSettings.autoScrollAfterSendDesc',
    keywords: ['发送后', '滚屏', 'scroll'],
    control: 'switch',
    settingKey: 'autoScrollAfterSend'
  },
  {
    id: 'basic.autoScrollOnWheel',
    category: 'basic',
    group: 'basic.display',
    labelKey: 'basicSettings.autoScrollOnWheel',
    descKey: 'basicSettings.autoScrollOnWheelDesc',
    keywords: ['滚轮', 'wheel', '鼠标', '滚屏'],
    control: 'switch',
    settingKey: 'autoScrollOnWheel'
  },
  {
    id: 'basic.clearInputAfterSend',
    category: 'basic',
    group: 'basic.display',
    labelKey: 'basicSettings.clearInputAfterSend',
    descKey: 'basicSettings.clearInputAfterSendDesc',
    keywords: ['清空输入', '输入框', 'clear', 'input'],
    control: 'switch',
    settingKey: 'clearInputAfterSend'
  },
  {
    id: 'basic.sendDisplayText',
    category: 'basic',
    group: 'basic.display',
    labelKey: 'basicSettings.sendDisplayText',
    descKey: 'basicSettings.sendDisplayTextDesc',
    keywords: ['发送前缀', 'SEND', '显示文本', 'prefix'],
    control: 'input',
    settingKey: 'sendDisplayText'
  },
  {
    id: 'basic.recvDisplayText',
    category: 'basic',
    group: 'basic.display',
    labelKey: 'basicSettings.recvDisplayText',
    descKey: 'basicSettings.recvDisplayTextDesc',
    keywords: ['接收前缀', 'RECV', '显示文本', 'prefix'],
    control: 'input',
    settingKey: 'recvDisplayText'
  },
  {
    id: 'basic.confirmCloseWithActiveConnections',
    category: 'basic',
    group: 'basic.display',
    labelKey: 'basicSettings.confirmCloseWithActiveConnections',
    descKey: 'basicSettings.confirmCloseWithActiveConnectionsDesc',
    keywords: ['退出确认', '关闭提醒', '二次确认', 'confirm', 'close'],
    control: 'switch',
    settingKey: 'confirmCloseWithActiveConnections'
  },

  // ---------------- serial ----------------
  {
    id: 'serial.supportedBaudRates',
    category: 'serial',
    group: 'serial.general',
    labelKey: 'serialSettings.supportedBaudRates',
    keywords: ['波特率', 'baud', 'rate', '9600', '115200'],
    control: 'input'
  },
  {
    id: 'serial.showPortType',
    category: 'serial',
    group: 'serial.general',
    labelKey: 'serialSettings.showPortType',
    descKey: 'serialSettings.showPortTypeDesc',
    keywords: ['端口类型', 'port type', 'USB', '蓝牙'],
    control: 'switch',
    settingKey: 'showPortType'
  },
  {
    id: 'serial.showFriendlyName',
    category: 'serial',
    group: 'serial.general',
    labelKey: 'serialSettings.showFriendlyName',
    descKey: 'serialSettings.showFriendlyNameDesc',
    keywords: ['设备名', '友好名称', 'friendly', 'name'],
    control: 'switch',
    settingKey: 'showFriendlyName'
  },
  {
    id: 'serial.showPortDetails',
    category: 'serial',
    group: 'serial.general',
    labelKey: 'serialSettings.showPortDetails',
    descKey: 'serialSettings.showPortDetailsDesc',
    keywords: ['设备详情', '详细信息', 'details', '硬件信息'],
    control: 'switch',
    settingKey: 'showPortDetails'
  },

  // ---------------- log ----------------
  {
    id: 'log.enableLogStorage',
    category: 'log',
    group: 'log.general',
    labelKey: 'logSettings.enableLogStorage',
    keywords: ['落盘', '保存日志', '启用日志', 'logging', 'storage'],
    control: 'switch',
    settingKey: 'enableLogStorage'
  },
  {
    id: 'log.logSplit',
    category: 'log',
    group: 'log.general',
    labelKey: 'logSettings.logSplit',
    descKey: 'logSettings.logSplitDesc',
    keywords: ['分片', '拆分', 'split'],
    control: 'switch',
    settingKey: 'logSplit'
  },
  {
    id: 'log.logSplitSize',
    category: 'log',
    group: 'log.general',
    labelKey: 'logSettings.logSplitSize',
    descKey: 'logSettings.logSplitSizeDesc',
    keywords: ['分片大小', '文件大小', 'size', 'MB'],
    control: 'slider',
    settingKey: 'logSplitSize'
  },
  {
    id: 'log.logWriteInterval',
    category: 'log',
    group: 'log.general',
    labelKey: 'logSettings.logWriteInterval',
    descKey: 'logSettings.logWriteIntervalDesc',
    keywords: ['落盘间隔', '写入频率', 'interval', 'flush'],
    control: 'select',
    settingKey: 'logWriteInterval'
  },
  {
    id: 'log.logPath',
    category: 'log',
    group: 'log.general',
    labelKey: 'logSettings.logPath',
    keywords: ['路径', '目录', '保存位置', 'path', 'directory', 'folder'],
    control: 'input',
    settingKey: 'logPath'
  },
  {
    id: 'log.logFileName',
    category: 'log',
    group: 'log.general',
    labelKey: 'logSettings.logFileName',
    keywords: ['文件名', '模板', '命名', 'filename', '%C', '%Y'],
    control: 'input',
    settingKey: 'logFileName'
  },
  {
    id: 'log.maxLogAgeDays',
    category: 'log',
    group: 'log.general',
    labelKey: 'logSettings.maxLogAgeDays',
    descKey: 'logSettings.maxLogAgeDaysDesc',
    keywords: ['保留', '过期', '天数', 'retention', 'days'],
    control: 'select',
    settingKey: 'maxLogAgeDays'
  },
  {
    id: 'log.maxLogCount',
    category: 'log',
    group: 'log.general',
    labelKey: 'logSettings.maxLogCount',
    descKey: 'logSettings.maxLogCountDesc',
    keywords: ['文件数', '数量上限', 'count', 'limit'],
    control: 'select',
    settingKey: 'maxLogCount'
  },
  {
    id: 'log.exportTimeRange',
    category: 'log',
    group: 'log.general',
    labelKey: 'logSettings.exportTimeRange',
    descKey: 'logSettings.exportTimeRangeDesc',
    keywords: ['导出', '时间范围', 'export', 'range'],
    control: 'select'
  },
  {
    id: 'log.cleanupNow',
    category: 'log',
    group: 'log.general',
    labelKey: 'logSettings.cleanupNow',
    descKey: 'logSettings.cleanupNowDesc',
    keywords: ['清理', '删除日志', 'cleanup', 'clean'],
    control: 'action'
  },

  // ---------------- syntax（嵌入组件，区域级） ----------------
  {
    id: 'syntax.rules',
    category: 'syntax',
    group: '',
    labelKey: 'settingsNav.syntax',
    keywords: ['语法高亮', '配色', '高亮规则', 'highlight', 'syntax', '颜色'],
    control: 'custom'
  },

  // ---------------- history ----------------
  {
    id: 'history.showCommandHistory',
    category: 'history',
    group: 'history.general',
    labelKey: 'historySettings.showCommandHistory',
    descKey: 'historySettings.showCommandHistoryDesc',
    keywords: ['历史命令', '命令弹窗', 'history'],
    control: 'switch',
    settingKey: 'showCommandHistory'
  },
  {
    id: 'history.commandHistoryMaxCount',
    category: 'history',
    group: 'history.general',
    labelKey: 'historySettings.commandHistoryMaxCount',
    descKey: 'historySettings.commandHistoryMaxCountDesc',
    keywords: ['条数', '上限', 'max', 'history count'],
    control: 'slider',
    settingKey: 'commandHistoryMaxCount'
  },

  // ---------------- backup ----------------
  {
    id: 'backup.manualBackup',
    category: 'backup',
    group: 'backup.create',
    labelKey: 'basicSettings.manualBackup',
    descKey: 'basicSettings.manualBackupDesc',
    keywords: ['备份', '立即备份', 'backup', '导出配置'],
    control: 'action'
  },
  {
    id: 'backup.autoBackup',
    category: 'backup',
    group: 'backup.create',
    labelKey: 'basicSettings.autoBackup',
    keywords: ['备份', '自动备份', 'backup'],
    control: 'switch',
    settingKey: 'autoBackup'
  },
  {
    id: 'backup.backupInterval',
    category: 'backup',
    group: 'backup.create',
    labelKey: 'basicSettings.backupInterval',
    keywords: ['周期', '间隔', 'interval', '每天', '每周'],
    control: 'select',
    conditional: true,
    settingKey: 'backupInterval'
  },

  // ---------------- mcp / 服务 ----------------
  {
    id: 'mcp.enable',
    category: 'mcp',
    group: 'mcp.service',
    labelKey: 'mcpSettings.enable',
    descKey: 'mcpSettings.enableDesc',
    keywords: ['开关', '启用', 'enable', 'MCP'],
    control: 'switch'
  },
  {
    id: 'mcp.port',
    category: 'mcp',
    group: 'mcp.service',
    labelKey: 'mcpSettings.port',
    descKey: 'mcpSettings.portDesc',
    keywords: ['端口', 'port', '监听', '32180'],
    control: 'number'
  },
  {
    id: 'mcp.accessMode',
    category: 'mcp',
    group: 'mcp.service',
    labelKey: 'mcpSettings.accessMode',
    descKey: 'mcpSettings.accessModeDesc',
    keywords: ['权限', '只读', '读写', '全部', 'readonly', 'readwrite', 'full'],
    control: 'custom'
  },
  {
    id: 'mcp.allowExport',
    category: 'mcp',
    group: 'mcp.service',
    labelKey: 'mcpSettings.allowExport',
    descKey: 'mcpSettings.allowExportDesc',
    keywords: ['导出', '文件上传', 'export', 'upload'],
    control: 'switch'
  },
  {
    id: 'mcp.status',
    category: 'mcp',
    group: 'mcp.service',
    labelKey: 'mcpSettings.status',
    keywords: ['状态', '运行中', 'status', 'running'],
    control: 'custom'
  },

  // ---------------- mcp / 权限 ----------------
  {
    id: 'mcp.endpoint',
    category: 'mcp',
    group: 'mcp.access',
    labelKey: 'mcpSettings.endpoint',
    descKey: 'mcpSettings.endpointDesc',
    keywords: ['地址', '接入地址', 'endpoint', 'url'],
    control: 'input'
  },
  {
    id: 'mcp.token',
    category: 'mcp',
    group: 'mcp.access',
    labelKey: 'mcpSettings.token',
    descKey: 'mcpSettings.tokenDesc',
    keywords: ['令牌', '密钥', 'token', 'bearer', '鉴权'],
    control: 'input',
    conditional: true
  },
  {
    id: 'mcp.rotateToken',
    category: 'mcp',
    group: 'mcp.access',
    labelKey: 'mcpSettings.rotateToken',
    descKey: 'mcpSettings.rotateTokenDesc',
    keywords: ['重置令牌', '轮换', 'rotate', '重新生成'],
    control: 'action'
  },
  {
    id: 'mcp.refresh',
    category: 'mcp',
    group: 'mcp.access',
    labelKey: 'mcpSettings.refresh',
    descKey: 'mcpSettings.refreshDesc',
    keywords: ['刷新', '状态', 'refresh', 'reload'],
    control: 'action'
  },
  {
    id: 'mcp.importTemplate',
    category: 'mcp',
    group: 'mcp.access',
    labelKey: 'mcpSettings.importTemplate',
    descKey: 'mcpSettings.importTemplateDesc',
    keywords: ['导入', '设备模板', '模板', 'template', 'import'],
    control: 'action'
  },

  // ---------------- mcp / skill ----------------
  {
    id: 'mcp.installSkill',
    category: 'mcp',
    group: 'mcp.skill',
    labelKey: 'mcpSettings.installSkill',
    descKey: 'mcpSettings.installSkillDesc',
    keywords: ['安装', '本机', 'skill', '扩展'],
    control: 'action'
  },
  {
    id: 'mcp.installTargets',
    category: 'mcp',
    group: 'mcp.skill',
    labelKey: 'mcpSettings.installTargets',
    descKey: 'mcpSettings.installTargetsDesc',
    keywords: ['安装目录', '目标目录', 'targets', 'path'],
    control: 'input',
    conditional: true
  }
]

/* ------------------------------------------------------------------ */
/* 搜索                                                                 */
/* ------------------------------------------------------------------ */

export interface SearchResult {
  /** 命中的设置项，已按相关度排序 */
  hits: SearchHit[]
  /** 应显示的 id 集合：命中项自身 + 其所属分组 */
  visibleIds: Set<string>
}

const EMPTY_RESULT = (): SearchResult => ({ hits: [], visibleIds: new Set() })

/** 在当前语言文本里找 query，返回命中下标，未命中返回 -1 */
function indexOfMatch(text: string, query: string): number {
  if (!text) return -1
  return text.toLowerCase().indexOf(query)
}

/**
 * 按关键词搜索设置项。
 *
 * - 空 query 视为「未进入搜索态」，返回空结果
 * - 依次按 标题 → 描述 → 别名 匹配，命中即停（保证优先级）
 * - 使用当前语言的翻译结果做匹配，因此中英文界面都能搜
 * - 返回的 visibleIds 额外包含命中项所属分组 id，便于整组显示
 */
export function searchSettings(query: string, t: TranslateFn): SearchResult {
  const q = (query ?? '').trim().toLowerCase()
  if (!q) return EMPTY_RESULT()

  const scored: Array<{ hit: SearchHit; field: 1 | 2 | 3; pos: number; order: number }> = []

  SETTINGS_INDEX.forEach((entry, order) => {
    let field: 1 | 2 | 3 = 1
    let pos = indexOfMatch(String(t(entry.labelKey) ?? ''), q)

    if (pos < 0 && entry.descKey) {
      pos = indexOfMatch(String(t(entry.descKey) ?? ''), q)
      field = 2
    }
    if (pos < 0 && entry.keywords?.length) {
      const aliasIndex = entry.keywords.findIndex((word) => indexOfMatch(word, q) >= 0)
      if (aliasIndex >= 0) {
        pos = aliasIndex
        field = 3
      }
    }
    if (pos >= 0) {
      scored.push({ hit: { entry, field }, field, pos, order })
    }
  })

  scored.sort((a, b) => a.field - b.field || a.pos - b.pos || a.order - b.order)

  const hits: SearchHit[] = []
  const visibleIds = new Set<string>()
  for (const item of scored) {
    hits.push(item.hit)
    visibleIds.add(item.hit.entry.id)
    if (item.hit.entry.group) {
      visibleIds.add(item.hit.entry.group)
    }
  }
  return { hits, visibleIds }
}
