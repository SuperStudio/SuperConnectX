import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import AiConfigStorage from '../../src/main/extensions/ai-control/infrastructure/AiConfigStorage'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('AiConfigStorage', () => {
  it('creates a safe default and enforces revisions', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-ai-config-'))
    dirs.push(dir)
    const storage = new AiConfigStorage(path.join(dir, 'ai-bridge.json'))
    const initial = await storage.init()
    expect(initial.shared.allowAiCloseUserConnection).toBe(false)
    expect(initial.shared.activity).toMatchObject({
      overlayClickable: true,
      overlayOpacity: 0.9,
      overlayPosition: 'bottom-left',
      overlayDuration: 4
    })
    expect(initial.instances['0'].enabled).toBe(false)
    expect(initial.instances['0'].token.length).toBeGreaterThan(20)
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, 'ai-bridge.json'), 'utf8')).shared.permission
    ).toBeUndefined()
    const saved = await storage.patch(0, {
      expectedRevision: initial.revision,
      instance: { enabled: true }
    })
    expect(saved.instances['0'].enabled).toBe(true)
    await expect(
      storage.patch(0, { expectedRevision: initial.revision, instance: { enabled: false } })
    ).rejects.toMatchObject({ code: 'CONFIG_CONFLICT' })
    storage.dispose()
  })

  it('removes the persisted permission from an existing configuration', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-ai-config-'))
    dirs.push(dir)
    const configPath = path.join(dir, 'ai-bridge.json')
    const first = new AiConfigStorage(configPath)
    await first.init()
    first.dispose()

    const legacyConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    legacyConfig.shared.permission = 'full-control'
    fs.writeFileSync(configPath, `${JSON.stringify(legacyConfig, null, 2)}\n`)

    const repaired = new AiConfigStorage(configPath)
    const config = await repaired.init()

    expect((config.shared as unknown as Record<string, unknown>).permission).toBeUndefined()
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).shared.permission).toBeUndefined()
    repaired.dispose()
  })

  it('converts the legacy overlay percentage while migrating settings', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-ai-config-'))
    dirs.push(dir)
    const configPath = path.join(dir, 'ai-bridge.json')
    const storage = new AiConfigStorage(configPath)

    const config = await storage.init({ aiActivityOverlayOpacity: 92 })

    expect(config.shared.activity.overlayOpacity).toBe(0.92)
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).shared.activity.overlayOpacity).toBe(
      0.92
    )
    storage.dispose()
  })

  it('repairs an existing config written with the legacy overlay percentage', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-ai-config-'))
    dirs.push(dir)
    const configPath = path.join(dir, 'ai-bridge.json')
    const first = new AiConfigStorage(configPath)
    await first.init()
    first.dispose()

    const legacyConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    legacyConfig.shared.activity.overlayOpacity = 92
    fs.writeFileSync(configPath, `${JSON.stringify(legacyConfig, null, 2)}\n`)

    const repaired = new AiConfigStorage(configPath)
    const config = await repaired.init()

    expect(config.shared.activity.overlayOpacity).toBe(0.92)
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).shared.activity.overlayOpacity).toBe(
      0.92
    )
    repaired.dispose()
  })

  it('migrates the legacy feedback controls from settings', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-ai-config-'))
    dirs.push(dir)
    const storage = new AiConfigStorage(path.join(dir, 'ai-bridge.json'))

    const config = await storage.init({
      aiActivityOverlayClickable: false,
      aiActivityOverlayPosition: 'top-right',
      aiActivityOverlayDuration: 16
    })

    expect(config.shared.activity.overlayClickable).toBe(false)
    expect(config.shared.activity.overlayPosition).toBe('top-right')
    expect(config.shared.activity.overlayDuration).toBe(0)
    storage.dispose()
  })

  it('repairs missing feedback fields and renames the old close permission', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-ai-config-'))
    dirs.push(dir)
    const configPath = path.join(dir, 'ai-bridge.json')
    const first = new AiConfigStorage(configPath)
    await first.init()
    first.dispose()

    const legacyConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    legacyConfig.shared.allowStopGuiSession = true
    delete legacyConfig.shared.allowAiCloseUserConnection
    delete legacyConfig.shared.activity.overlayClickable
    delete legacyConfig.shared.activity.overlayPosition
    delete legacyConfig.shared.activity.overlayDuration
    fs.writeFileSync(configPath, `${JSON.stringify(legacyConfig, null, 2)}\n`)

    const repaired = new AiConfigStorage(configPath)
    const config = await repaired.init()

    expect(config.shared.allowAiCloseUserConnection).toBe(true)
    expect(config.shared.activity.overlayClickable).toBe(true)
    expect(config.shared.activity.overlayPosition).toBe('bottom-left')
    expect(config.shared.activity.overlayDuration).toBe(4)
    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    expect(persisted.shared.allowStopGuiSession).toBeUndefined()
    expect(persisted.shared.allowAiCloseUserConnection).toBe(true)
    repaired.dispose()
  })
})
