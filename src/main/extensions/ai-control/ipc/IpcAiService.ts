import { BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'path'
import * as z from 'zod/v4'
import type {
  AiConfigDocument,
  AiConfigPatch
} from '../../../../shared/extensions/ai-control/AiConfigTypes'
import AiConfigService from '../infrastructure/AiConfigService'
import AiActivityService from '../infrastructure/AiActivityService'
import McpServerManager from '../adapters/mcp/McpServerManager'

const patchSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    shared: z
      .object({
        basePort: z.number().int().min(1024).max(65535).optional(),
        allowAiCloseUserConnection: z.boolean().optional(),
        capabilityGroups: z
          .object({
            sessionRead: z.boolean().optional(),
            serialWrite: z.boolean().optional(),
            sessionManage: z.boolean().optional(),
            connectionManage: z.boolean().optional(),
            commandManage: z.boolean().optional(),
            configManage: z.boolean().optional(),
            auditRead: z.boolean().optional()
          })
          .strict()
          .optional(),
        activity: z
          .object({
            overlayClickable: z.boolean().optional(),
            overlayOpacity: z.number().min(0.2).max(1).optional(),
            overlayPosition: z
              .enum([
                'top-left',
                'top-center',
                'top-right',
                'middle-left',
                'center',
                'middle-right',
                'bottom-left',
                'bottom-center',
                'bottom-right'
              ])
              .optional(),
            overlayDuration: z.number().int().min(0).max(15).optional(),
            logMaxSizeMb: z.number().int().min(1).max(100).optional(),
            logMaxFiles: z.number().int().min(1).max(10).optional(),
            commandContentMode: z.enum(['none', 'preview', 'full']).optional()
          })
          .strict()
          .optional()
      })
      .strict()
      .optional(),
    instance: z
      .object({
        enabled: z.boolean().optional(),
        alias: z.string().max(80).optional(),
        portOverride: z.number().int().min(1024).max(65535).nullable().optional()
      })
      .strict()
      .optional()
  })
  .strict()

export default class IpcAiService {
  private registered = false
  private releaseState?: () => void
  private releaseConfig?: () => void

  constructor(
    private readonly windows: { mainWindow?: BrowserWindow | null },
    private readonly config: AiConfigService,
    private readonly manager: McpServerManager,
    private readonly activity: AiActivityService
  ) {}

  init(): void {
    if (this.registered) return
    this.registered = true
    ipcMain.handle('ai-service:get-state', () => this.manager.getStatus())
    ipcMain.handle('ai-service:set-permission', (event, value: unknown) => {
      const mainWebContents = this.windows.mainWindow?.webContents
      if (!mainWebContents || event.sender.id !== mainWebContents.id)
        throw new Error('AI permission can only be changed from the main application window')
      return this.manager.setPermission(z.enum(['read-only', 'full-control']).parse(value))
    })
    ipcMain.handle('ai-service:get-config', () => this.sanitize(this.config.get()))
    ipcMain.handle('ai-service:save-config', async (_, value: unknown) => {
      const patch = patchSchema.parse(value) as AiConfigPatch
      const saved = await this.config.patch(patch)
      await this.manager.reconcile()
      return this.sanitize(saved)
    })
    ipcMain.handle('ai-service:run-self-test', () => this.manager.runSelfTest())
    ipcMain.handle('ai-service:rotate-token', async () => {
      const saved = await this.config.rotateToken()
      await this.manager.invalidateSessions()
      return { config: this.sanitize(saved), codexConfig: this.codexConfig() }
    })
    ipcMain.handle('ai-service:get-codex-config', () => this.codexConfig())
    ipcMain.handle('ai-service:read-activity', (_, limit?: number) =>
      this.activity.read(Math.max(1, Math.min(2000, Number(limit) || 200)))
    )
    ipcMain.handle('ai-service:clear-activity', () => this.activity.clear())
    ipcMain.handle('ai-service:open-log-directory', () => this.activity.openDirectory())
    ipcMain.handle('ai-service:choose-log-directory', async () => {
      const options = {
        properties: ['openDirectory', 'createDirectory'] as Array<
          'openDirectory' | 'createDirectory'
        >
      }
      const result = this.windows.mainWindow
        ? await dialog.showOpenDialog(this.windows.mainWindow, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || !result.filePaths[0]) return { canceled: true }
      const selected = path.resolve(result.filePaths[0])
      const current = this.config.get()
      const saved = await this.config.patch({
        expectedRevision: current.revision,
        shared: { activity: { logRoot: selected } }
      })
      return { canceled: false, directory: selected, config: this.sanitize(saved) }
    })
    this.releaseState = this.manager.onStateChanged((status) =>
      this.send('ai-service:state-changed', status)
    )
    this.releaseConfig = this.config.onChanged((value) =>
      this.send('ai-service:config-changed', this.sanitize(value))
    )
  }

  dispose(): void {
    this.releaseState?.()
    this.releaseConfig?.()
    for (const channel of [
      'ai-service:get-state',
      'ai-service:set-permission',
      'ai-service:get-config',
      'ai-service:save-config',
      'ai-service:run-self-test',
      'ai-service:rotate-token',
      'ai-service:get-codex-config',
      'ai-service:read-activity',
      'ai-service:clear-activity',
      'ai-service:open-log-directory',
      'ai-service:choose-log-directory'
    ])
      ipcMain.removeHandler(channel)
    this.registered = false
  }

  private sanitize(config: AiConfigDocument): AiConfigDocument {
    const copy = structuredClone(config)
    for (const instance of Object.values(copy.instances)) instance.token = '[REDACTED]'
    return copy
  }

  private codexConfig(): string {
    const status = this.manager.getStatus()
    const name = `superconnectx_${status.instanceIndex + 1}`
    const token = this.config.getInstance().token
    return `[mcp_servers.${name}]\nurl = "${status.endpoint}"\nhttp_headers = { Authorization = "Bearer ${token}" }\nenabled = true\n`
  }

  private send(channel: string, payload: unknown): void {
    const webContents = this.windows.mainWindow?.webContents
    if (webContents && !webContents.isDestroyed()) webContents.send(channel, payload)
  }
}
