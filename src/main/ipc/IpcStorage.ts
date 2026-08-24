import ConnectionStorage from '../storage/ConnectionStorage'
import PreSetCommandStorage from '../storage/PreSetCommandStorage'
import ShortcutsStorage, { SHORTCUT_ACTIONS } from '../storage/ShortcutsStorage'
import { ipcMain } from 'electron'
import logger from './IpcAppLogger'
import CommandGroupStorage from '../storage/CommandGroupStorage'
import ComSettingsStorage from '../storage/ComSettingsStorage'
import AppSettingsStorage from '../storage/AppSettingsStorage'
import SettingsStorage from '../storage/SettingsStorage'
import CommandHistoryStorage from '../storage/CommandHistoryStorage'
import LogFilterStorage from '../storage/LogFilterStorage'
import IpcConnector from './IpcConnector'
import BackupManager from '../utils/BackupManager'
import AdmZip from 'adm-zip'
import fs from 'fs'
import ConfigService, { ConfigDomainAdapter, ConfigServiceError } from '../services/ConfigService'
import RuntimeEventHub from '../services/RuntimeEventHub'
import { CoreCatalog } from '../services/types/CoreCatalog'
import { STORAGE_IPC_CHANNELS } from '../../shared/ipc/storage'
const archiver = require('archiver')

export default class IpcStorage {
  private static sInstance: IpcStorage
  private configService: ConfigService | null = null
  private coreCatalog: CoreCatalog | null = null
  private settingsStorage: SettingsStorage | null = null

  constructor() {}

  static getInstance(): IpcStorage {
    if (IpcStorage.sInstance == null) {
      IpcStorage.sInstance = new IpcStorage()
    }

    return IpcStorage.sInstance
  }

  init(eventHub?: RuntimeEventHub): void {
    const configService = new ConfigService(eventHub || new RuntimeEventHub())
    this.configService = configService
    /* 连接持久化处理 */
    const connectionStorage = new ConnectionStorage()
    ipcMain.handle('get-connections', () => connectionStorage.getAll())
    ipcMain.handle('add-connection', (_, conn: any) => {
      const result = connectionStorage.add(conn)
      configService.recordExternalChange('connections', null, { operation: 'created' }, 'gui')
      return result
    })
    ipcMain.handle('update-connection', (_, conn: any) => {
      const result = connectionStorage.update(conn)
      if (result) {
        configService.recordExternalChange('connections', null, { operation: 'updated' }, 'gui')
      }
      return result
    })
    ipcMain.handle('delete-connection', (_, id: number) => {
      const before = connectionStorage.getAll().length
      const result = connectionStorage.delete(id)
      if (Array.isArray(result) && result.length < before) {
        configService.recordExternalChange('connections', null, { operation: 'deleted' }, 'gui')
      }
      return result
    })

    /* 发送命令持久化 */
    const preSetCommandStorage = new PreSetCommandStorage()
    ipcMain.handle('get-preset-commands', () => preSetCommandStorage.getAll())
    ipcMain.handle('add-preset-command', (_, cmd: any) => {
      const result = preSetCommandStorage.add(cmd)
      if (result) {
        configService.recordExternalChange('preset-commands', null, { operation: 'created' }, 'gui')
      }
      return result
    })
    ipcMain.handle('update-preset-command', (_, cmd: any) => {
      const result = preSetCommandStorage.update(cmd)
      if (result) {
        configService.recordExternalChange('preset-commands', null, { operation: 'updated' }, 'gui')
      }
      return result
    })
    ipcMain.handle('delete-preset-command', (_, id: number) => {
      const before = preSetCommandStorage.getAll().length
      const result = preSetCommandStorage.delete(id)
      if (Array.isArray(result) && result.length < before) {
        configService.recordExternalChange('preset-commands', null, { operation: 'deleted' }, 'gui')
      }
      return result
    })

    /* 组持久化 */
    const groupStorage = new CommandGroupStorage()
    ipcMain.handle('get-command-groups', () => groupStorage.getAll())
    ipcMain.handle('add-command-group', (_, group) => {
      const result = groupStorage.add(group)
      if (result) {
        configService.recordExternalChange('command-groups', null, { operation: 'created' }, 'gui')
      }
      return result
    })
    ipcMain.handle('update-command-group', (_, group) => {
      const result = groupStorage.update(group)
      if (result) {
        configService.recordExternalChange('command-groups', null, { operation: 'updated' }, 'gui')
      }
      return result
    })
    ipcMain.handle('delete-command-group', (_, id) => {
      const before = groupStorage.getAll().length
      preSetCommandStorage.deleteByGroupId(id)
      const result = groupStorage.delete(id)
      if (Array.isArray(result) && result.length < before) {
        configService.recordExternalChange('command-groups', null, { operation: 'deleted' }, 'gui')
        configService.recordExternalChange(
          'preset-commands',
          null,
          { operation: 'deleted-by-group' },
          'gui'
        )
      }
      return result
    })

    /* 命令导入导出 */
    ipcMain.handle('export-commands', (_, filePath: string) =>
      preSetCommandStorage.exportCommands(groupStorage, filePath)
    )

    ipcMain.handle('import-commands', (_, filePath: string) => {
      const result = preSetCommandStorage.importCommands(groupStorage, filePath)
      if (result.success) {
        configService.recordExternalChange('command-groups', null, { operation: 'imported' }, 'gui')
        configService.recordExternalChange(
          'preset-commands',
          null,
          { operation: 'imported' },
          'gui'
        )
      }
      return result
    })

    /* COM 串口设置持久化 */
    const comSettingsStorage = new ComSettingsStorage()
    ipcMain.handle('get-com-settings', (_, comName: string) => {
      return configService.get('com-settings', comName).value
    })
    ipcMain.handle(
      'save-com-settings',
      async (_, comName: string, settings: Record<string, unknown>) => {
        await configService.patch({
          domain: 'com-settings',
          targetId: comName,
          patch: settings,
          source: 'gui'
        })
        return true
      }
    )

    /* 全局波特率列表持久化 */
    ipcMain.handle('get-baud-rates', () => {
      const value = configService.get('baud-rates').value
      return Array.isArray(value?.baudRates) ? value.baudRates : []
    })
    ipcMain.handle('save-baud-rates', async (_, baudRates: number[]) => {
      await configService.patch({ domain: 'baud-rates', patch: { baudRates }, source: 'gui' })
      return true
    })

    /* 应用全局设置持久化 */
    const appSettingsStorage = new AppSettingsStorage()
    ipcMain.handle(STORAGE_IPC_CHANNELS.getAppPreferences, () => appSettingsStorage.getSettings())
    ipcMain.handle(
      STORAGE_IPC_CHANNELS.saveAppPreferences,
      async (_, settings: Record<string, unknown>) => {
        await configService.patch({ domain: 'app-settings', patch: settings, source: 'gui' })
        return true
      }
    )

    /* 日志过滤面板持久化 */
    const logFilterStorage = new LogFilterStorage()
    ipcMain.handle('get-log-filter', () => logFilterStorage.getSettings())
    ipcMain.handle('save-log-filter', async (_, settings: Record<string, unknown>) => {
      await configService.patch({ domain: 'log-filter', patch: settings, source: 'gui' })
      return true
    })

    /* 设置页面持久化 */
    const settingsStorage = new SettingsStorage()
    this.settingsStorage = settingsStorage

    this.coreCatalog = {
      listConnections: () => connectionStorage.getAll(),
      createConnection: (connection) => connectionStorage.add(connection),
      updateConnection: (connection) => connectionStorage.update(connection),
      deleteConnection: (id) => connectionStorage.delete(id),
      listCommandGroups: () => groupStorage.getAll(),
      createCommandGroup: (group) =>
        groupStorage.add({
          name: String(group.name || ''),
          connectionType: String(group.connectionType || 'com')
        }),
      updateCommandGroup: (group) =>
        groupStorage.update({
          groupId: Number(group.groupId),
          name: String(group.name || ''),
          connectionType: String(group.connectionType || 'com')
        }),
      deleteCommandGroup: (id) => {
        preSetCommandStorage.deleteByGroupId(id)
        return groupStorage.delete(id)
      },
      listPresetCommands: () => preSetCommandStorage.getAll(),
      createPresetCommand: (command) => preSetCommandStorage.add(command),
      updatePresetCommand: (command) => preSetCommandStorage.update(command),
      deletePresetCommand: (id) => preSetCommandStorage.delete(id)
    }

    /* 命令历史持久化（需要在 settings 之后初始化，因为依赖 settingsStorage） */
    const commandHistoryStorage = new CommandHistoryStorage(settingsStorage)

    ipcMain.handle(STORAGE_IPC_CHANNELS.getSettings, () => configService.get('settings').value)
    ipcMain.handle(STORAGE_IPC_CHANNELS.getDefaultSettings, () => settingsStorage.getDefaults())
    ipcMain.handle(
      STORAGE_IPC_CHANNELS.saveSettings,
      async (_, settings: Record<string, unknown>) => {
        await configService.patch({ domain: 'settings', patch: settings, source: 'gui' })
        return true
      }
    )

    /* 语法高亮规则组 */
    ipcMain.handle('get-syntax-rule-groups', () => {
      const settings = settingsStorage.getSettings()
      return settings.syntaxRuleGroups || []
    })
    ipcMain.handle('save-syntax-rule-groups', (_, groups: any[]) => {
      settingsStorage.saveSettings({ syntaxRuleGroups: groups } as any)
      return true
    })

    /* SuperCom 导入（命令 + 语法高亮） */
    ipcMain.handle('import-from-supercom', (_, filePath: string) =>
      preSetCommandStorage.importFromSuperCom(groupStorage, filePath, settingsStorage)
    )

    ipcMain.handle('get-command-history', (_, protocolType: string) =>
      commandHistoryStorage.getHistory(protocolType)
    )
    ipcMain.handle('add-command-history', (_, protocolType: string, command: string) => {
      commandHistoryStorage.addCommand(protocolType, command)
      return true
    })
    ipcMain.handle('clear-command-history', (_, protocolType: string) => {
      commandHistoryStorage.clearHistory(protocolType)
      return true
    })
    ipcMain.handle('remove-command-history', (_, protocolType: string, command: string) => {
      commandHistoryStorage.removeCommand(protocolType, command)
      return true
    })

    /* 快捷键持久化 */
    const shortcutsStorage = new ShortcutsStorage()
    ipcMain.handle('get-shortcuts', () => shortcutsStorage.getAll())
    ipcMain.handle('get-default-shortcuts', () => shortcutsStorage.getDefaults())
    ipcMain.handle('save-shortcuts', (_, shortcuts: any[]) => {
      shortcutsStorage.saveAll(shortcuts)
      return true
    })
    ipcMain.handle('get-shortcut-actions', () => SHORTCUT_ACTIONS)

    this.registerCoreConfigDomains(
      configService,
      connectionStorage,
      preSetCommandStorage,
      groupStorage,
      comSettingsStorage,
      appSettingsStorage,
      settingsStorage,
      shortcutsStorage,
      logFilterStorage
    )
    configService.addApplyHandler(async ({ domain, patch }) => {
      if (domain !== 'settings') return
      if (patch.logSplitSize)
        IpcConnector.getInstance().applySettings({ logSplitSize: patch.logSplitSize as number })
      if (patch.enableLogStorage !== undefined)
        IpcConnector.getInstance().applySettings({
          enableLogStorage: patch.enableLogStorage as boolean
        })
      if (patch.logPath !== undefined)
        IpcConnector.getInstance().applySettings({ logPath: patch.logPath as string })
      if (patch.logFileName !== undefined)
        IpcConnector.getInstance().applySettings({ logFileName: patch.logFileName as string })
      if (patch.commandHistoryMaxCount)
        commandHistoryStorage.applyMaxCount(patch.commandHistoryMaxCount as number)
    })

    /* 备份与恢复 */
    ipcMain.handle(STORAGE_IPC_CHANNELS.getBackupList, () => BackupManager.getInstance().getBackupList())
    ipcMain.handle(STORAGE_IPC_CHANNELS.performBackup, () => BackupManager.getInstance().performBackupNow())
    ipcMain.handle(STORAGE_IPC_CHANNELS.restoreBackup, (_, dateStr: string) =>
      BackupManager.getInstance().restoreBackup(dateStr)
    )
    ipcMain.handle(STORAGE_IPC_CHANNELS.getNextBackupDate, (_, backupInterval: number) =>
      BackupManager.getInstance().getNextBackupDate(backupInterval)
    )

    /* 导出数据（勾选多个类型，打包为 ZIP） */
    ipcMain.handle('export-data', async (_, filePath: string, selections: string[]) => {
      try {
        logger.info(
          '[IpcStorage] export-data start, filePath:',
          filePath,
          'selections:',
          selections
        )
        await exportDataToZip(
          connectionStorage,
          groupStorage,
          preSetCommandStorage,
          comSettingsStorage,
          appSettingsStorage,
          settingsStorage,
          filePath,
          selections
        )
        logger.info('[IpcStorage] export-data success')
        return { success: true }
      } catch (err: any) {
        logger.error('[IpcStorage] export-data failed:', err.message, err.stack)
        return { success: false, message: err.message }
      }
    })

    /* 导入数据（从 ZIP 文件导入） */
    ipcMain.handle('import-data', async (_, filePath: string) => {
      try {
        logger.info('[IpcStorage] import-data start, filePath:', filePath)
        const result = await importDataFromZip(
          connectionStorage,
          groupStorage,
          preSetCommandStorage,
          comSettingsStorage,
          appSettingsStorage,
          settingsStorage,
          filePath
        )
        if (result.__invalidFormat) {
          logger.warn('[IpcStorage] import-data: invalid format, no importable data found')
          return { success: false, message: 'INVALID_FORMAT' }
        }
        logger.info('[IpcStorage] import-data success:', JSON.stringify(result))
        return { success: true, ...result }
      } catch (err: any) {
        logger.error('[IpcStorage] import-data failed:', err.message, err.stack)
        return { success: false, message: err.message }
      }
    })

    logger.info(`init IpcStorage done`)
  }

  getConfigService(): ConfigService {
    if (!this.configService) throw new Error('IpcStorage has not been initialized')
    return this.configService
  }

  getCoreCatalog(): CoreCatalog {
    if (!this.coreCatalog) throw new Error('IpcStorage has not been initialized')
    return this.coreCatalog
  }

  removeLegacyAiSettings(): void {
    this.settingsStorage?.removeLegacyAiSettings()
  }

  private registerCoreConfigDomains(
    configService: ConfigService,
    connectionStorage: ConnectionStorage,
    preSetCommandStorage: PreSetCommandStorage,
    groupStorage: CommandGroupStorage,
    comSettingsStorage: ComSettingsStorage,
    appSettingsStorage: AppSettingsStorage,
    settingsStorage: SettingsStorage,
    shortcutsStorage: ShortcutsStorage,
    logFilterStorage: LogFilterStorage
  ): void {
    type SettingsRecord = ReturnType<SettingsStorage['getSettings']>
    type ComSettingsRecord = NonNullable<ReturnType<ComSettingsStorage['getSettings']>>
    type AppSettingsRecord = ReturnType<AppSettingsStorage['getSettings']>
    type LogFilterRecord = ReturnType<LogFilterStorage['getSettings']>

    const field = (
      path: string,
      type: ConfigDomainAdapter['schema']['fields'][number]['type'],
      applyMode: 'immediate' | 'reconnect' | 'restart' | 'task' = 'immediate',
      constraints: Pick<
        ConfigDomainAdapter['schema']['fields'][number],
        'enum' | 'min' | 'max'
      > = {}
    ): ConfigDomainAdapter['schema']['fields'][number] => ({
      path,
      type,
      readable: true,
      writable: true,
      secret: false,
      applyMode,
      ...constraints
    })
    const settingsFields = [
      'minimizeToTray',
      'logSplit',
      'logSplitSize',
      'autoScroll',
      'autoScrollToast',
      'autoScrollOnFocus',
      'autoScrollAfterSend',
      'autoScrollOnWheel',
      'language',
      'autoBackup',
      'backupInterval',
      'autoStart',
      'preventSleep',
      'maxDisplayText',
      'sendDisplayText',
      'recvDisplayText',
      'supportedBaudRates',
      'showPortType',
      'enableLogStorage',
      'logPath',
      'logFileName',
      'maxLogSize',
      'logTimestamp',
      'logHex',
      'enableSyntaxHighlight',
      'syntaxRuleGroups',
      'searchCaseSensitive',
      'searchRegex',
      'searchWholeWord',
      'commandHistoryMaxCount',
      'showCommandHistory',
      'clearInputAfterSend'
    ]
    const settingTypes: Record<string, ConfigDomainAdapter['schema']['fields'][number]['type']> = {
      minimizeToTray: 'boolean',
      logSplit: 'boolean',
      logSplitSize: 'number',
      autoScroll: 'boolean',
      autoScrollToast: 'boolean',
      autoScrollOnFocus: 'boolean',
      autoScrollAfterSend: 'boolean',
      autoScrollOnWheel: 'boolean',
      language: 'string',
      autoBackup: 'boolean',
      backupInterval: 'number',
      autoStart: 'boolean',
      preventSleep: 'boolean',
      maxDisplayText: 'number',
      sendDisplayText: 'string',
      recvDisplayText: 'string',
      supportedBaudRates: 'array',
      showPortType: 'boolean',
      enableLogStorage: 'boolean',
      logPath: 'string',
      logFileName: 'string',
      maxLogSize: 'number',
      logTimestamp: 'boolean',
      logHex: 'boolean',
      enableSyntaxHighlight: 'boolean',
      syntaxRuleGroups: 'array',
      searchCaseSensitive: 'boolean',
      searchRegex: 'boolean',
      searchWholeWord: 'boolean',
      commandHistoryMaxCount: 'number',
      showCommandHistory: 'boolean',
      clearInputAfterSend: 'boolean'
    }
    configService.register({
      domain: 'settings',
      schema: {
        domain: 'settings',
        targetRequired: false,
        fields: settingsFields.map((key) => {
          const item = field(key, settingTypes[key] || 'object')
          if (key === 'logSplitSize' || key === 'maxDisplayText') {
            item.min = 1
            item.max = 100
          }
          if (key === 'commandHistoryMaxCount') {
            item.min = 1
            item.max = 100
          }
          return item
        })
      },
      get: () => settingsStorage.getSettings() as unknown as Record<string, unknown>,
      patch: (_targetId, patch) => {
        if ('supportedBaudRates' in patch) {
          if (
            !Array.isArray(patch.supportedBaudRates) ||
            patch.supportedBaudRates.length === 0 ||
            patch.supportedBaudRates.some(
              (value) => typeof value !== 'number' || !Number.isFinite(value) || value <= 0
            )
          ) {
            throw new ConfigServiceError(
              'CONFIG_INVALID_PATCH',
              'supportedBaudRates must contain positive finite numbers'
            )
          }
        }
        settingsStorage.saveSettings(patch as SettingsRecord)
        return settingsStorage.getSettings() as unknown as Record<string, unknown>
      }
    })

    configService.register({
      domain: 'com-settings',
      schema: {
        domain: 'com-settings',
        targetRequired: true,
        fields: [
          field('baudRate', 'number', 'reconnect', { min: 1 }),
          field('dataBits', 'enum', 'reconnect', { enum: [5, 6, 7, 8] }),
          field('stopBits', 'enum', 'reconnect', { enum: [1, 1.5, 2] }),
          field('parity', 'enum', 'reconnect', {
            enum: ['none', 'even', 'odd', 'mark', 'space']
          }),
          field('encoding', 'string', 'reconnect'),
          field('readTimeout', 'number', 'reconnect', { min: 0 }),
          field('writeTimeout', 'number', 'reconnect', { min: 0 }),
          field('flowControl', 'enum', 'reconnect', {
            enum: ['none', 'hardware', 'software']
          }),
          field('rts', 'boolean', 'reconnect'),
          field('dtr', 'boolean', 'reconnect'),
          field('remark', 'string'),
          field('fontSize', 'number'),
          field('fontFamily', 'string'),
          field('hexDisplayMode', 'boolean'),
          field('showTimestamp', 'boolean'),
          field('autoNewline', 'boolean'),
          field('hexMode', 'boolean'),
          field('crcEnabled', 'boolean'),
          field('crcMethod', 'string'),
          field('commandInput', 'string')
        ]
      },
      get: (targetId) =>
        targetId
          ? (comSettingsStorage.getSettings(targetId) as unknown as Record<string, unknown> | null)
          : null,
      patch: (targetId, patch) => {
        if (!targetId) throw new Error('com-settings requires targetId')
        const current = (comSettingsStorage.getSettings(targetId) || {}) as Record<string, unknown>
        const merged = { ...current, ...patch }
        comSettingsStorage.saveSettings(targetId, merged as unknown as ComSettingsRecord)
        return merged
      }
    })

    configService.register({
      domain: 'baud-rates',
      schema: {
        domain: 'baud-rates',
        targetRequired: false,
        fields: [field('baudRates', 'array')]
      },
      get: () => ({ baudRates: comSettingsStorage.getBaudRates() }),
      patch: (_targetId, patch) => {
        if (
          !Array.isArray(patch.baudRates) ||
          patch.baudRates.some(
            (value) => typeof value !== 'number' || !Number.isFinite(value) || value <= 0
          )
        ) {
          throw new ConfigServiceError(
            'CONFIG_INVALID_PATCH',
            'baudRates must contain only positive finite numbers'
          )
        }
        comSettingsStorage.saveBaudRates(patch.baudRates as number[])
        return { baudRates: comSettingsStorage.getBaudRates() }
      }
    })

    // AppSettings 同时包含对象、数字、字符串和布尔值，必须按真实类型校验。
    // 统一标成 object 会导致 GUI 保存当前设置分类或终端开关时被错误拒绝。
    configService.register({
      domain: 'app-settings',
      schema: {
        domain: 'app-settings',
        targetRequired: false,
        fields: [
          field('sidebar', 'object'),
          field('terminalFontSize', 'number'),
          field('settingsActiveCategory', 'string'),
          field('commandEditorSelectedGroupId', 'object'),
          field('commandEditorCurrentCommandId', 'object'),
          field('terminalWordWrap', 'boolean'),
          field('terminalLineNumbers', 'boolean'),
          field('terminalLogEditable', 'boolean'),
          field('terminalSyntaxGroupId', 'object')
        ]
      },
      get: () => appSettingsStorage.getSettings() as unknown as Record<string, unknown>,
      patch: (_targetId, patch) => {
        appSettingsStorage.saveSettings(patch as AppSettingsRecord)
        return appSettingsStorage.getSettings() as unknown as Record<string, unknown>
      }
    })

    configService.register({
      domain: 'log-filter',
      schema: {
        domain: 'log-filter',
        targetRequired: false,
        fields: [field('pattern', 'string'), field('panelWidth', 'number')]
      },
      get: () => logFilterStorage.getSettings() as unknown as Record<string, unknown>,
      patch: (_targetId, patch) => {
        logFilterStorage.saveSettings(patch as LogFilterRecord)
        return logFilterStorage.getSettings() as unknown as Record<string, unknown>
      }
    })

    configService.register({
      domain: 'connections',
      schema: {
        domain: 'connections',
        targetRequired: false,
        fields: [
          field('name', 'string'),
          field('host', 'string'),
          field('port', 'number'),
          field('connectionType', 'enum'),
          field('username', 'string'),
          field('password', 'string')
        ]
      },
      get: (targetId) => {
        const items = connectionStorage.getAll()
        if (!targetId) return { items }
        return {
          items: items.filter(
            (item: Record<string, unknown>) => String(item.id) === String(targetId)
          )
        }
      },
      patch: (targetId, patch) => {
        if (!targetId) throw new Error('connections requires targetId')
        connectionStorage.update({ id: Number(targetId), ...patch })
        return { items: connectionStorage.getAll() }
      }
    })

    configService.register({
      domain: 'shortcuts',
      schema: { domain: 'shortcuts', targetRequired: false, fields: [field('items', 'array')] },
      get: () => ({ items: shortcutsStorage.getAll() }),
      patch: (_targetId, patch) => {
        if (!Array.isArray(patch.items)) throw new Error('shortcuts.items must be an array')
        shortcutsStorage.saveAll(patch.items as Parameters<ShortcutsStorage['saveAll']>[0])
        return { items: shortcutsStorage.getAll() }
      }
    })

    configService.register({
      domain: 'preset-commands',
      schema: {
        domain: 'preset-commands',
        targetRequired: false,
        fields: [field('items', 'array')]
      },
      get: () => ({ items: preSetCommandStorage.getAll() }),
      patch: (_targetId, patch) => {
        if (!Array.isArray(patch.items)) throw new Error('preset-commands.items must be an array')
        preSetCommandStorage.saveAll(patch.items as Parameters<PreSetCommandStorage['saveAll']>[0])
        return { items: preSetCommandStorage.getAll() }
      }
    })

    configService.register({
      domain: 'command-groups',
      schema: {
        domain: 'command-groups',
        targetRequired: false,
        fields: [field('items', 'array')]
      },
      get: () => ({ items: groupStorage.getAll() }),
      patch: (_targetId, patch) => {
        if (!Array.isArray(patch.items)) throw new Error('command-groups.items must be an array')
        groupStorage.saveAll(patch.items as Parameters<CommandGroupStorage['saveAll']>[0])
        return { items: groupStorage.getAll() }
      }
    })
  }
}

/**
 * 将选中的数据类别打包为 ZIP 文件
 *
 * 每个勾选的类别会导出为一个 JSON 文件，所有文件打包进一个 ZIP。
 * 文件列表：
 *   settings     -> settings.json       (全局设置 + 语法高亮规则组)
 *   commandGroups -> commandGroups.json  (命令组)
 *   commands     -> commands.json        (预设命令)
 *   comPorts     -> comPorts.json        (COM 串口设置 + 波特率列表)
 *   connections  -> connections.json     (连接配置，密码已脱敏)
 */
async function exportDataToZip(
  connectionStorage: ConnectionStorage,
  groupStorage: CommandGroupStorage,
  preSetCommandStorage: PreSetCommandStorage,
  comSettingsStorage: ComSettingsStorage,
  _appSettingsStorage: AppSettingsStorage,
  settingsStorage: SettingsStorage,
  filePath: string,
  selections: string[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filePath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    let settled = false
    const settle = (err?: Error): void => {
      if (settled) return
      settled = true
      if (err) {
        // 清理不完整的文件
        try {
          fs.unlinkSync(filePath)
        } catch (_) {
          /* ignore */
        }
        reject(err)
      } else {
        resolve()
      }
    }

    output.on('close', () => settle())
    output.on('error', (err) => settle(err))
    archive.on('error', (err) => settle(err))

    archive.pipe(output)

    const addJsonEntry = (name: string, data: any): void => {
      archive.append(JSON.stringify(data, null, 2), { name })
    }

    try {
      if (selections.includes('settings')) {
        const settings = settingsStorage.getSettings()
        addJsonEntry('settings.json', {
          exportTime: new Date().toISOString(),
          type: 'settings',
          data: settings
        })
      }

      if (selections.includes('commandGroups')) {
        const groups = groupStorage.getAll()
        addJsonEntry('commandGroups.json', {
          exportTime: new Date().toISOString(),
          type: 'commandGroups',
          data: groups
        })
      }

      if (selections.includes('commands')) {
        const commands = preSetCommandStorage.getAll()
        addJsonEntry('commands.json', {
          exportTime: new Date().toISOString(),
          type: 'commands',
          data: commands
        })
      }

      if (selections.includes('comPorts')) {
        const store = (comSettingsStorage as any).storageData
        const ports = store ? store.get('ports') || {} : {}
        const baudRates = comSettingsStorage.getBaudRates()
        addJsonEntry('comPorts.json', {
          exportTime: new Date().toISOString(),
          type: 'comPorts',
          data: { ports, baudRates }
        })
      }

      if (selections.includes('connections')) {
        const connections = connectionStorage.getAll()
        // 密码已脱敏（ConnectionStorage.getAll 返回时已将密码替换为掩码）
        const sanitized = connections.map((c: any) => ({
          ...c,
          password: c.password && c.password !== '' ? '***' : ''
        }))
        addJsonEntry('connections.json', {
          exportTime: new Date().toISOString(),
          type: 'connections',
          data: sanitized
        })
      }
    } catch (err: any) {
      settle(err)
      return
    }

    // 如果没有选中任何项目，直接 resolve（空 zip 也可以）
    archive.finalize()
  })
}

/**
 * 从 ZIP 文件导入数据
 *
 * ZIP 中包含若干 JSON 文件，每个对应一个数据类别：
 *   settings.json      -> 全局设置 + 语法高亮规则组（覆盖）
 *   commandGroups.json -> 命令组（自动新增，按 name+connectionType 去重）
 *   commands.json      -> 预设命令（自动新增，按 name+groupId+command 去重）
 *   comPorts.json      -> COM 串口设置 + 波特率列表（覆盖）
 *   connections.json   -> 连接配置（自动新增，按 connectionType+name+host+port 去重，密码为空）
 */
async function importDataFromZip(
  connectionStorage: ConnectionStorage,
  groupStorage: CommandGroupStorage,
  preSetCommandStorage: PreSetCommandStorage,
  comSettingsStorage: ComSettingsStorage,
  _appSettingsStorage: AppSettingsStorage,
  settingsStorage: SettingsStorage,
  filePath: string
): Promise<Record<string, any>> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`file not exists: ${filePath}`)
  }

  const zip = new AdmZip(filePath)
  const zipEntries = zip.getEntries()
  const result: Record<string, any> = {}

  // 辅助：读取 ZIP 中的 JSON 条目
  const readJsonEntry = (entryName: string): any | null => {
    const entry = zipEntries.find((e) => e.entryName === entryName)
    if (!entry) return null
    try {
      return JSON.parse(entry.getData().toString('utf8'))
    } catch {
      logger.warn(`[importDataFromZip] failed to parse ${entryName}`)
      return null
    }
  }

  // ---- 1. settings (覆盖) ----
  const settingsData = readJsonEntry('settings.json')
  if (settingsData?.data) {
    settingsStorage.saveSettings(settingsData.data)
    result.settingsImported = true
    logger.info('[importDataFromZip] settings imported (overwrite)')
  }

  // ---- 2. commandGroups (自动新增) ----
  const groupsData = readJsonEntry('commandGroups.json')
  if (groupsData?.data && Array.isArray(groupsData.data)) {
    const existingGroups = groupStorage.getAll()
    let groupsAdded = 0
    let groupsSkipped = 0
    for (const g of groupsData.data) {
      const exists = existingGroups.some(
        (eg) => eg.name === g.name && eg.connectionType === g.connectionType
      )
      if (!exists) {
        groupStorage.add({ name: g.name, connectionType: g.connectionType })
        groupsAdded++
      } else {
        groupsSkipped++
      }
    }
    result.groupsImported = groupsAdded
    result.groupsSkipped = groupsSkipped
    logger.info(`[importDataFromZip] commandGroups: ${groupsAdded} added, ${groupsSkipped} skipped`)
  }

  // ---- 3. commands (自动新增，去重) ----
  const commandsData = readJsonEntry('commands.json')
  if (commandsData?.data && Array.isArray(commandsData.data)) {
    const existingCommands = preSetCommandStorage.getAll()
    let commandsAdded = 0
    let commandsSkipped = 0
    for (const cmd of commandsData.data) {
      // 按 name+groupId+command 去重
      const exists = existingCommands.some(
        (ec) => ec.name === cmd.name && ec.groupId === cmd.groupId && ec.command === cmd.command
      )
      if (!exists) {
        preSetCommandStorage.add({
          name: cmd.name,
          command: cmd.command,
          delay: cmd.delay || 0,
          seqNum: cmd.seqNum || 1,
          groupId: cmd.groupId || 0
        })
        commandsAdded++
      } else {
        commandsSkipped++
      }
    }
    result.commandsImported = commandsAdded
    result.commandsSkipped = commandsSkipped
    logger.info(`[importDataFromZip] commands: ${commandsAdded} added, ${commandsSkipped} skipped`)
  }

  // ---- 4. comPorts (覆盖) ----
  const comPortsData = readJsonEntry('comPorts.json')
  if (comPortsData?.data) {
    const store = (comSettingsStorage as any).storageData
    if (store) {
      // 覆盖波特率
      if (comPortsData.data.baudRates && Array.isArray(comPortsData.data.baudRates)) {
        comSettingsStorage.saveBaudRates(comPortsData.data.baudRates)
      }
      // 覆盖串口设置
      if (comPortsData.data.ports && typeof comPortsData.data.ports === 'object') {
        for (const [comName, settings] of Object.entries(comPortsData.data.ports)) {
          comSettingsStorage.saveSettings(comName, settings as any)
        }
      }
      result.comPortsImported = true
      logger.info('[importDataFromZip] comPorts imported (overwrite)')
    }
  }

  // ---- 5. connections (自动新增，去重) ----
  const connectionsData = readJsonEntry('connections.json')
  if (connectionsData?.data && Array.isArray(connectionsData.data)) {
    const existingConnections = connectionStorage.getAll()
    let connsAdded = 0
    let connsSkipped = 0
    for (const conn of connectionsData.data) {
      // 按 connectionType+name+host+port 去重
      const exists = existingConnections.some(
        (ec) =>
          ec.connectionType === conn.connectionType &&
          ec.name === conn.name &&
          ec.host === conn.host &&
          ec.port === conn.port
      )
      if (!exists) {
        // 导出时密码已脱敏为 ***，导入时密码留空
        const toAdd = { ...conn }
        delete toAdd.id // 去掉原 ID，由 add 方法自动分配
        if (toAdd.password) toAdd.password = '' // 密码不导入
        try {
          connectionStorage.add(toAdd)
          connsAdded++
        } catch (err: any) {
          logger.warn(`[importDataFromZip] skip connection "${conn.name}": ${err.message}`)
          connsSkipped++
        }
      } else {
        connsSkipped++
      }
    }
    result.connectionsImported = connsAdded
    result.connectionsSkipped = connsSkipped
    logger.info(`[importDataFromZip] connections: ${connsAdded} added, ${connsSkipped} skipped`)
  }

  // 检查是否至少有一类数据被导入
  const hasAnyData =
    result.settingsImported ||
    result.comPortsImported ||
    result.groupsImported !== undefined ||
    result.commandsImported !== undefined ||
    result.connectionsImported !== undefined

  if (!hasAnyData) {
    return { __invalidFormat: true }
  }

  return result
}
