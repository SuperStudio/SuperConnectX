import { EventEmitter } from 'events'
import { randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import lockfile from 'proper-lockfile'
import writeFileAtomic from 'write-file-atomic'
import * as z from 'zod/v4'
import type {
  AiConfigDocument,
  AiConfigPatch,
  AiInstanceConfig
} from '../../../../shared/extensions/ai-control/AiConfigTypes'
import { AiOperationError } from '../application/AiErrors'

const capabilitySchema = z
  .object({
    sessionRead: z.boolean(),
    serialWrite: z.boolean(),
    sessionManage: z.boolean(),
    connectionManage: z.boolean(),
    commandManage: z.boolean(),
    configManage: z.boolean(),
    auditRead: z.boolean()
  })
  .strict()

const instanceSchema = z
  .object({
    enabled: z.boolean(),
    alias: z.string().max(80),
    portOverride: z.number().int().min(1024).max(65535).nullable(),
    token: z.string().min(20).max(200)
  })
  .strict()

const configSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    shared: z
      .object({
        basePort: z.number().int().min(1024).max(65535),
        capabilityGroups: capabilitySchema,
        allowAiCloseUserConnection: z.boolean(),
        activity: z
          .object({
            overlayClickable: z.boolean(),
            overlayOpacity: z.number().min(0.2).max(1),
            overlayPosition: z.enum([
              'top-left',
              'top-center',
              'top-right',
              'middle-left',
              'center',
              'middle-right',
              'bottom-left',
              'bottom-center',
              'bottom-right'
            ]),
            overlayDuration: z.number().int().min(0).max(15),
            logRoot: z.string().max(4096),
            logMaxSizeMb: z.number().int().min(1).max(100),
            logMaxFiles: z.number().int().min(1).max(10),
            commandContentMode: z.enum(['none', 'preview', 'full'])
          })
          .strict()
      })
      .strict(),
    instances: z.record(z.string().regex(/^\d+$/), instanceSchema)
  })
  .strict()

export type AiConfigChangeListener = (config: AiConfigDocument) => void

const makeToken = (): string => randomBytes(32).toString('base64url')

function defaultInstance(): AiInstanceConfig {
  return { enabled: false, alias: '', portOverride: null, token: makeToken() }
}

function createDefault(): AiConfigDocument {
  return {
    version: 1,
    revision: 1,
    shared: {
      basePort: 32180,
      capabilityGroups: {
        sessionRead: true,
        serialWrite: true,
        sessionManage: true,
        connectionManage: true,
        commandManage: true,
        configManage: true,
        auditRead: true
      },
      allowAiCloseUserConnection: false,
      activity: {
        overlayClickable: true,
        overlayOpacity: 0.9,
        overlayPosition: 'bottom-left',
        overlayDuration: 4,
        logRoot: '',
        logMaxSizeMb: 10,
        logMaxFiles: 5,
        commandContentMode: 'preview'
      }
    },
    instances: { '0': defaultInstance() }
  }
}

function normalizeKnownLegacyValues(value: unknown): { value: unknown; changed: boolean } {
  if (!value || typeof value !== 'object') return { value, changed: false }
  const document = value as Record<string, unknown>
  const shared = document.shared
  if (!shared || typeof shared !== 'object') return { value, changed: false }
  const sharedRecord = shared as Record<string, unknown>
  let changed = false
  // 旧版本曾把 AI 权限持久化。权限现为主进程运行时状态，每次启动固定只读。
  if ('permission' in sharedRecord) {
    delete sharedRecord.permission
    changed = true
  }
  const activity = sharedRecord.activity
  if (!activity || typeof activity !== 'object') return { value, changed }
  const activityRecord = activity as Record<string, unknown>
  const opacity = activityRecord.overlayOpacity

  // 旧 Bridge 使用 30~100 的百分比，新 MCP 配置使用 0.2~1 的 CSS opacity。
  if (typeof opacity === 'number' && opacity > 1 && opacity <= 100) {
    activityRecord.overlayOpacity = opacity / 100
    changed = true
  }
  if (typeof activityRecord.overlayClickable !== 'boolean') {
    activityRecord.overlayClickable = true
    changed = true
  }
  if (typeof activityRecord.overlayPosition !== 'string') {
    activityRecord.overlayPosition = 'bottom-left'
    changed = true
  }
  if (typeof activityRecord.overlayDuration !== 'number') {
    activityRecord.overlayDuration = 4
    changed = true
  }
  if (typeof sharedRecord.allowAiCloseUserConnection !== 'boolean') {
    sharedRecord.allowAiCloseUserConnection = sharedRecord.allowStopGuiSession === true
    delete sharedRecord.allowStopGuiSession
    changed = true
  }
  return { value, changed }
}

export default class AiConfigStorage {
  private current: AiConfigDocument = createDefault()
  private readonly events = new EventEmitter()
  private watcher?: fs.FSWatcher
  private watchTimer?: NodeJS.Timeout
  private statTimer?: NodeJS.Timeout
  private lastMtimeMs = 0

  constructor(private readonly configPath: string) {}

  async init(legacy?: Record<string, unknown>): Promise<AiConfigDocument> {
    await fs.promises.mkdir(path.dirname(this.configPath), { recursive: true })
    if (!fs.existsSync(this.configPath)) {
      const initial = this.migrateLegacy(legacy)
      await this.writeUnlocked(initial)
    } else {
      await this.repairKnownLegacyConfig()
    }
    await this.reload(true)
    this.startWatching()
    return this.get()
  }

  get(): AiConfigDocument {
    return structuredClone(this.current)
  }

  getInstance(instanceIndex: number): AiInstanceConfig {
    return structuredClone(this.current.instances[String(instanceIndex)] || defaultInstance())
  }

  async ensureInstance(instanceIndex: number): Promise<AiConfigDocument> {
    const key = String(instanceIndex)
    if (this.current.instances[key]) return this.get()
    return this.mutate(this.current.revision, (draft) => {
      if (!draft.instances[key]) draft.instances[key] = defaultInstance()
    })
  }

  async patch(instanceIndex: number, patch: AiConfigPatch): Promise<AiConfigDocument> {
    return this.mutate(patch.expectedRevision, (draft) => {
      if (patch.shared) {
        const { capabilityGroups, activity, ...shared } = patch.shared
        Object.assign(draft.shared, shared)
        if (capabilityGroups) Object.assign(draft.shared.capabilityGroups, capabilityGroups)
        if (activity) Object.assign(draft.shared.activity, activity)
      }
      if (patch.instance) {
        const key = String(instanceIndex)
        draft.instances[key] ||= defaultInstance()
        Object.assign(draft.instances[key], patch.instance)
      }
    })
  }

  async rotateToken(instanceIndex: number): Promise<AiConfigDocument> {
    return this.mutate(this.current.revision, (draft) => {
      const key = String(instanceIndex)
      draft.instances[key] ||= defaultInstance()
      draft.instances[key].token = makeToken()
    })
  }

  onChanged(listener: AiConfigChangeListener): () => void {
    this.events.on('changed', listener)
    return () => this.events.off('changed', listener)
  }

  async refreshIfChanged(): Promise<void> {
    try {
      const stat = await fs.promises.stat(this.configPath)
      if (stat.mtimeMs !== this.lastMtimeMs) await this.reload(false)
    } catch {
      // Last known good configuration remains active.
    }
  }

  dispose(): void {
    this.watcher?.close()
    if (this.watchTimer) clearTimeout(this.watchTimer)
    if (this.statTimer) clearInterval(this.statTimer)
    this.events.removeAllListeners()
  }

  private async mutate(
    expectedRevision: number,
    mutate: (draft: AiConfigDocument) => void
  ): Promise<AiConfigDocument> {
    let release: (() => Promise<void>) | undefined
    try {
      release = await lockfile.lock(this.configPath, {
        realpath: false,
        stale: 10_000,
        update: 2_000,
        retries: { retries: 5, minTimeout: 40, maxTimeout: 250 }
      })
      const latest = await this.readFile()
      if (latest.revision !== expectedRevision) {
        throw new AiOperationError('CONFIG_CONFLICT', 'AI configuration revision changed', true, {
          expectedRevision,
          actualRevision: latest.revision
        })
      }
      const draft = structuredClone(latest)
      mutate(draft)
      draft.revision += 1
      const validated = configSchema.parse(draft) as AiConfigDocument
      await this.writeUnlocked(validated)
      this.current = validated
      this.events.emit('changed', this.get())
      return this.get()
    } catch (error) {
      if (error instanceof AiOperationError) throw error
      if (error instanceof z.ZodError) {
        throw new AiOperationError('CONFIG_INVALID', z.prettifyError(error))
      }
      const code =
        error && typeof error === 'object' ? (error as { code?: string }).code : undefined
      throw new AiOperationError(
        code === 'ELOCKED' ? 'CONFIG_BUSY' : 'CONFIG_WRITE_FAILED',
        error instanceof Error ? error.message : String(error),
        code === 'ELOCKED'
      )
    } finally {
      await release?.().catch(() => undefined)
    }
  }

  private async reload(initial: boolean): Promise<void> {
    const parsed = await this.readFile()
    const changed = parsed.revision !== this.current.revision
    this.current = parsed
    const stat = await fs.promises.stat(this.configPath)
    this.lastMtimeMs = stat.mtimeMs
    if (!initial && changed) this.events.emit('changed', this.get())
  }

  private async readFile(): Promise<AiConfigDocument> {
    const raw = JSON.parse(await fs.promises.readFile(this.configPath, 'utf8'))
    const normalized = normalizeKnownLegacyValues(raw)
    return configSchema.parse(normalized.value) as AiConfigDocument
  }

  private async repairKnownLegacyConfig(): Promise<void> {
    let release: (() => Promise<void>) | undefined
    try {
      release = await lockfile.lock(this.configPath, {
        realpath: false,
        stale: 10_000,
        update: 2_000,
        retries: { retries: 5, minTimeout: 40, maxTimeout: 250 }
      })
      const raw = JSON.parse(await fs.promises.readFile(this.configPath, 'utf8'))
      const normalized = normalizeKnownLegacyValues(raw)
      const validated = configSchema.parse(normalized.value) as AiConfigDocument
      if (normalized.changed) await this.writeUnlocked(validated)
    } finally {
      await release?.().catch(() => undefined)
    }
  }

  private async writeUnlocked(config: AiConfigDocument): Promise<void> {
    await writeFileAtomic(this.configPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    if (process.platform !== 'win32') await fs.promises.chmod(this.configPath, 0o600)
    const stat = await fs.promises.stat(this.configPath)
    this.lastMtimeMs = stat.mtimeMs
  }

  private startWatching(): void {
    this.watcher = fs.watch(path.dirname(this.configPath), (_event, fileName) => {
      if (fileName && fileName.toString() !== path.basename(this.configPath)) return
      if (this.watchTimer) clearTimeout(this.watchTimer)
      this.watchTimer = setTimeout(() => void this.reload(false).catch(() => undefined), 100)
    })
    this.statTimer = setInterval(() => void this.refreshIfChanged(), 1_000)
    this.statTimer.unref()
  }

  private migrateLegacy(legacy?: Record<string, unknown>): AiConfigDocument {
    const initial = createDefault()
    if (!legacy) return initial
    const instance = initial.instances['0']
    instance.enabled = legacy.aiBridgeEnabled === true
    if (typeof legacy.aiActivityOverlayOpacity === 'number') {
      const opacity = legacy.aiActivityOverlayOpacity
      initial.shared.activity.overlayOpacity =
        opacity > 1 && opacity <= 100 ? opacity / 100 : opacity
    }
    if (typeof legacy.aiActivityOverlayClickable === 'boolean')
      initial.shared.activity.overlayClickable = legacy.aiActivityOverlayClickable
    if (
      typeof legacy.aiActivityOverlayPosition === 'string' &&
      [
        'top-left',
        'top-center',
        'top-right',
        'middle-left',
        'center',
        'middle-right',
        'bottom-left',
        'bottom-center',
        'bottom-right'
      ].includes(legacy.aiActivityOverlayPosition)
    )
      initial.shared.activity.overlayPosition =
        legacy.aiActivityOverlayPosition as AiConfigDocument['shared']['activity']['overlayPosition']
    if (typeof legacy.aiActivityOverlayDuration === 'number') {
      const duration = Math.round(legacy.aiActivityOverlayDuration)
      initial.shared.activity.overlayDuration =
        duration <= 0 || duration >= 16 ? 0 : Math.min(15, Math.max(1, duration))
    }
    if (typeof legacy.aiActivityLogPath === 'string')
      initial.shared.activity.logRoot = legacy.aiActivityLogPath
    if (typeof legacy.aiActivityLogMaxSizeMb === 'number')
      initial.shared.activity.logMaxSizeMb = legacy.aiActivityLogMaxSizeMb
    if (typeof legacy.aiActivityLogMaxFiles === 'number')
      initial.shared.activity.logMaxFiles = legacy.aiActivityLogMaxFiles
    return configSchema.parse(initial) as AiConfigDocument
  }
}
