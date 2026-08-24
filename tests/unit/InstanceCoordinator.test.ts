import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import InstanceCoordinator from '../../src/main/services/InstanceCoordinator'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true })
})

function runtimeDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scx-instance-'))
  directories.push(directory)
  fs.mkdirSync(path.join(directory, 'requests'), { recursive: true })
  fs.mkdirSync(path.join(directory, 'slots'), { recursive: true })
  return directory
}

type CoordinatorInternals = {
  claimLowestSlot(runtimeDir: string): { index: number; leaseId: string } | undefined
  claimExplicit(runtimeDir: string, index: number, leaseId: string, reserved: boolean): boolean
  removeOwned(file: string, leaseId: string): void
}

const internals = InstanceCoordinator as unknown as CoordinatorInternals

describe('InstanceCoordinator', () => {
  it('reserves the lowest free slot and validates a child lease', () => {
    const directory = runtimeDirectory()
    const first = internals.claimLowestSlot(directory)!
    const second = internals.claimLowestSlot(directory)!
    expect([first.index, second.index]).toEqual([0, 1])
    expect(internals.claimExplicit(directory, first.index, 'wrong-lease', true)).toBe(false)
    expect(internals.claimExplicit(directory, first.index, first.leaseId, true)).toBe(true)
  })

  it('only removes a slot owned by the supplied lease', () => {
    const directory = runtimeDirectory()
    const slot = internals.claimLowestSlot(directory)!
    const file = path.join(directory, 'slots', `${slot.index}.json`)
    internals.removeOwned(file, 'not-owner')
    expect(fs.existsSync(file)).toBe(true)
    internals.removeOwned(file, slot.leaseId)
    expect(fs.existsSync(file)).toBe(false)
  })

  it('reclaims an expired reservation even when the coordinator process is alive', () => {
    const directory = runtimeDirectory()
    const reserved = internals.claimLowestSlot(directory)!
    const file = path.join(directory, 'slots', `${reserved.index}.json`)
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
    value.heartbeatAt = new Date(Date.now() - 11_000).toISOString()
    fs.writeFileSync(file, JSON.stringify(value))
    const replacement = internals.claimLowestSlot(directory)!
    expect(replacement.index).toBe(reserved.index)
    expect(replacement.leaseId).not.toBe(reserved.leaseId)
  })
})
