import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AiActivityLog from '../../src/main/extensions/ai-control/infrastructure/AiActivityLog'
import type { RuntimeEvent } from '../../src/main/services/types/RuntimeTypes'

vi.mock('electron', () => ({
  shell: { openPath: vi.fn(async () => '') }
}))

const temporaryDirectories: string[] = []

function activityEvent(sequence: number): RuntimeEvent {
  return {
    eventId: `activity-${sequence}`,
    sequence,
    timestamp: new Date(2026, 7, 20, 10, 0, sequence).toISOString(),
    eventType: 'ai.activity',
    source: 'ai',
    payload: {
      method: 'read_buffer',
      action: 'read',
      status: 'success',
      details: { sessionId: 'session-test', command: 'x'.repeat(120) }
    }
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('AiActivityLog', () => {
  it('writes asynchronously, rotates by size, and reads a bounded recent history', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-ai-activity-'))
    temporaryDirectories.push(directory)
    const log = new AiActivityLog(
      { error: vi.fn(), warn: vi.fn() },
      { directory, maxFileBytes: 1024, maxFiles: 3 }
    )

    for (let sequence = 1; sequence <= 30; sequence++) log.record(activityEvent(sequence))
    await log.flush()

    const files = fs
      .readdirSync(directory)
      .filter((name) => name.startsWith('ai-activity'))
      .sort()
    expect(files).toHaveLength(3)
    expect(files).toContain('ai-activity-current.log')
    expect(files.filter((name) => name !== 'ai-activity-current.log')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^ai-activity-\d{8}-\d{9}(?:-\d{3})?\.log$/),
        expect.stringMatching(/^ai-activity-\d{8}-\d{9}(?:-\d{3})?\.log$/)
      ])
    )
    for (const file of files) {
      expect(fs.statSync(path.join(directory, file)).size).toBeLessThanOrEqual(1024)
    }

    const history = await log.readHistory(5)
    expect(history.map((event) => event.sequence)).toEqual([26, 27, 28, 29, 30])

    log.configure({ maxFileBytes: 1024, maxFiles: 1 })
    await log.flush()
    expect(
      fs
        .readdirSync(directory)
        .filter((name) => name !== 'ai-activity-current.log' && name.endsWith('.log'))
    ).toEqual([])
  })

  it('switches to a configured directory without mixing queued writes', async () => {
    const firstDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-ai-activity-first-'))
    const secondDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-ai-activity-second-'))
    temporaryDirectories.push(firstDirectory, secondDirectory)
    const log = new AiActivityLog(
      { error: vi.fn(), warn: vi.fn() },
      { directory: firstDirectory, maxFileBytes: 1024, maxFiles: 3 }
    )

    log.record(activityEvent(1))
    log.configure({ directory: secondDirectory, maxFileBytes: 1024, maxFiles: 3 })
    log.record(activityEvent(2))
    await log.flush()

    expect(fs.readFileSync(path.join(firstDirectory, 'ai-activity-current.log'), 'utf8')).toContain(
      '"sequence":1'
    )
    expect(
      fs.readFileSync(path.join(secondDirectory, 'ai-activity-current.log'), 'utf8')
    ).toContain('"sequence":2')
    expect(log.getInfo()).toEqual({
      directory: secondDirectory,
      filePath: path.join(secondDirectory, 'ai-activity-current.log')
    })
  })
})
