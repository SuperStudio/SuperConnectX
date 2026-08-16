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
const archiver = require('archiver')

export default class IpcStorage {
  private static sInstance: IpcStorage

  constructor() {}

  static getInstance(): IpcStorage {
    if (IpcStorage.sInstance == null) {
      IpcStorage.sInstance = new IpcStorage()
    }

    return IpcStorage.sInstance
  }

  init(): void {
    /* 连接持久化处理 */
    const connectionStorage = new ConnectionStorage()
    ipcMain.handle('get-connections', () => connectionStorage.getAll())
    ipcMain.handle('add-connection', (_, conn: any) => connectionStorage.add(conn))
    ipcMain.handle('update-connection', (_, conn: any) => connectionStorage.update(conn))
    ipcMain.handle('delete-connection', (_, id: number) => connectionStorage.delete(id))

    /* 发送命令持久化 */
    const preSetCommandStorage = new PreSetCommandStorage()
    ipcMain.handle('get-preset-commands', () => preSetCommandStorage.getAll())
    ipcMain.handle('add-preset-command', (_, cmd: any) => preSetCommandStorage.add(cmd))
    ipcMain.handle('update-preset-command', (_, cmd: any) => preSetCommandStorage.update(cmd))
    ipcMain.handle('delete-preset-command', (_, id: number) => preSetCommandStorage.delete(id))

    /* 组持久化 */
    const groupStorage = new CommandGroupStorage()
    ipcMain.handle('get-command-groups', () => groupStorage.getAll())
    ipcMain.handle('add-command-group', (_, group) => groupStorage.add(group))
    ipcMain.handle('update-command-group', (_, group) => groupStorage.update(group))
    ipcMain.handle('delete-command-group', (_, id) => {
      preSetCommandStorage.deleteByGroupId(id)
      return groupStorage.delete(id)
    })

    /* 命令导入导出 */
    ipcMain.handle('export-commands', (_, filePath: string) =>
      preSetCommandStorage.exportCommands(groupStorage, filePath)
    )

    ipcMain.handle('import-commands', (_, filePath: string) =>
      preSetCommandStorage.importCommands(groupStorage, filePath)
    )

    /* COM 串口设置持久化 */
    const comSettingsStorage = new ComSettingsStorage()
    ipcMain.handle('get-com-settings', (_, comName: string) => {
      return comSettingsStorage.getSettings(comName)
    })
    ipcMain.handle('save-com-settings', (_, comName: string, settings: any) => {
      comSettingsStorage.saveSettings(comName, settings)
      return true
    })

    /* 全局波特率列表持久化 */
    ipcMain.handle('get-baud-rates', () => {
      return comSettingsStorage.getBaudRates()
    })
    ipcMain.handle('save-baud-rates', (_, baudRates: number[]) => {
      comSettingsStorage.saveBaudRates(baudRates)
      return true
    })

    /* 应用全局设置持久化 */
    const appSettingsStorage = new AppSettingsStorage()
    ipcMain.handle('get-app-settings', () => appSettingsStorage.getSettings())
    ipcMain.handle('save-app-settings', (_, settings: any) => {
      appSettingsStorage.saveSettings(settings)
      return true
    })

    /* 日志过滤面板持久化 */
    const logFilterStorage = new LogFilterStorage()
    ipcMain.handle('get-log-filter', () => logFilterStorage.getSettings())
    ipcMain.handle('save-log-filter', (_, settings: any) => {
      logFilterStorage.saveSettings(settings)
      return true
    })

    /* 设置页面持久化 */
    const settingsStorage = new SettingsStorage()

    /* 命令历史持久化（需要在 settings 之后初始化，因为依赖 settingsStorage） */
    const commandHistoryStorage = new CommandHistoryStorage(settingsStorage)

    ipcMain.handle('get-settings', () => settingsStorage.getSettings())
    ipcMain.handle('get-default-settings', () => settingsStorage.getDefaults())
    ipcMain.handle('save-settings', (_, settings: any) => {
      settingsStorage.saveSettings(settings)
      // 日志分片大小需实时生效，无需重启
      if (settings.logSplitSize) {
        IpcConnector.getInstance().applySettings({ logSplitSize: settings.logSplitSize })
      }
      // 启用日志存储开关需实时生效
      if (settings.enableLogStorage !== undefined) {
        IpcConnector.getInstance().applySettings({ enableLogStorage: settings.enableLogStorage })
      }
      // 日志保存路径需实时生效
      if (settings.logPath !== undefined) {
        IpcConnector.getInstance().applySettings({ logPath: settings.logPath })
      }
      // 日志文件名模板需实时生效
      if (settings.logFileName !== undefined) {
        IpcConnector.getInstance().applySettings({ logFileName: settings.logFileName })
      }
      // 命令历史最大数量变更时裁剪历史记录
      if (settings.commandHistoryMaxCount) {
        commandHistoryStorage.applyMaxCount(settings.commandHistoryMaxCount)
      }
      return true
    })

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

    ipcMain.handle('get-command-history', (_, protocolType: string) => commandHistoryStorage.getHistory(protocolType))
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

    /* 备份与恢复 */
    ipcMain.handle('get-backup-list', () => BackupManager.getInstance().getBackupList())
    ipcMain.handle('perform-backup', () => BackupManager.getInstance().performBackupNow())
    ipcMain.handle('restore-backup', (_, dateStr: string) =>
      BackupManager.getInstance().restoreBackup(dateStr)
    )
    ipcMain.handle('get-next-backup-date', (_, backupInterval: number) =>
      BackupManager.getInstance().getNextBackupDate(backupInterval)
    )

    /* 导出数据（勾选多个类型，打包为 ZIP） */
    ipcMain.handle('export-data', async (_, filePath: string, selections: string[]) => {
      try {
        logger.info('[IpcStorage] export-data start, filePath:', filePath, 'selections:', selections)
        await exportDataToZip(connectionStorage, groupStorage, preSetCommandStorage,
          comSettingsStorage, appSettingsStorage, settingsStorage, filePath, selections)
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
        const result = await importDataFromZip(connectionStorage, groupStorage, preSetCommandStorage,
          comSettingsStorage, appSettingsStorage, settingsStorage, filePath)
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
        try { fs.unlinkSync(filePath) } catch (_) { /* ignore */ }
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
