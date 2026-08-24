import { randomBytes, randomUUID } from 'crypto'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

interface LeaseFile {
  instanceIndex: number
  pid: number
  leaseId: string
  state: 'reserved' | 'running'
  startedAt: string
  heartbeatAt: string
}

interface CoordinatorFile {
  pid: number
  leaseId: string
  heartbeatAt: string
}

export default class InstanceCoordinator {
  private heartbeat?: NodeJS.Timeout
  private requestPoll?: NodeJS.Timeout
  private watcher?: fs.FSWatcher

  private constructor(
    private readonly runtimeDir: string,
    private readonly instanceIndex: number,
    private readonly leaseId: string,
    private readonly coordinatorLeaseId?: string
  ) {}

  static bootstrap(): { coordinator?: InstanceCoordinator; shouldExit: boolean } {
    const userDataRoot = process.env.SCX_USER_DATA_DIR || app.getPath('userData')
    const runtimeDir = path.join(userDataRoot, '_instance_runtime')
    fs.mkdirSync(path.join(runtimeDir, 'requests'), { recursive: true })
    fs.mkdirSync(path.join(runtimeDir, 'slots'), { recursive: true })
    const explicitArgument = InstanceCoordinator.argValue('--instance-index=')
    const explicit = InstanceCoordinator.parseIndex()
    const suppliedLease = InstanceCoordinator.argValue('--instance-lease=')

    if (explicitArgument !== undefined && explicit === undefined) return { shouldExit: true }

    if (explicit !== undefined) {
      const leaseId = suppliedLease || randomBytes(32).toString('base64url')
      if (!InstanceCoordinator.claimExplicit(runtimeDir, explicit, leaseId, Boolean(suppliedLease)))
        return { shouldExit: true }
      process.env.SCX_INSTANCE_INDEX = String(explicit)
      const coordinator = new InstanceCoordinator(runtimeDir, explicit, leaseId)
      coordinator.start()
      return { coordinator, shouldExit: false }
    }

    const coordinatorLease = randomBytes(32).toString('base64url')
    if (!InstanceCoordinator.claimCoordinator(runtimeDir, coordinatorLease)) {
      InstanceCoordinator.enqueueRequest(runtimeDir)
      return { shouldExit: true }
    }
    const index = InstanceCoordinator.claimLowestSlot(runtimeDir)
    if (!index) {
      InstanceCoordinator.removeOwned(path.join(runtimeDir, 'coordinator.json'), coordinatorLease)
      return { shouldExit: true }
    }
    process.env.SCX_INSTANCE_INDEX = String(index.index)
    const coordinator = new InstanceCoordinator(
      runtimeDir,
      index.index,
      index.leaseId,
      coordinatorLease
    )
    coordinator.start()
    return { coordinator, shouldExit: false }
  }

  dispose(): void {
    if (this.heartbeat) clearInterval(this.heartbeat)
    if (this.requestPoll) clearInterval(this.requestPoll)
    this.watcher?.close()
    InstanceCoordinator.removeOwned(this.slotPath(this.instanceIndex), this.leaseId)
    if (this.coordinatorLeaseId)
      InstanceCoordinator.removeOwned(
        path.join(this.runtimeDir, 'coordinator.json'),
        this.coordinatorLeaseId
      )
  }

  private start(): void {
    this.updateHeartbeat()
    this.heartbeat = setInterval(() => this.updateHeartbeat(), 2_000)
    this.heartbeat.unref()
    if (this.coordinatorLeaseId) {
      const requests = path.join(this.runtimeDir, 'requests')
      this.watcher = fs.watch(requests, () => this.consumeRequests())
      this.requestPoll = setInterval(() => this.consumeRequests(), 250)
      this.requestPoll.unref()
    }
    process.once('exit', () => this.dispose())
  }

  private updateHeartbeat(): void {
    const now = new Date().toISOString()
    const slot = InstanceCoordinator.readJson<LeaseFile>(this.slotPath(this.instanceIndex))
    if (slot?.leaseId === this.leaseId)
      InstanceCoordinator.atomicWrite(this.slotPath(this.instanceIndex), {
        ...slot,
        pid: process.pid,
        state: 'running',
        heartbeatAt: now
      })
    if (this.coordinatorLeaseId) {
      const file = path.join(this.runtimeDir, 'coordinator.json')
      const current = InstanceCoordinator.readJson<CoordinatorFile>(file)
      if (current?.leaseId === this.coordinatorLeaseId)
        InstanceCoordinator.atomicWrite(file, { ...current, pid: process.pid, heartbeatAt: now })
    }
  }

  private consumeRequests(): void {
    const directory = path.join(this.runtimeDir, 'requests')
    for (const name of fs.readdirSync(directory).filter((item) => item.endsWith('.json'))) {
      const source = path.join(directory, name)
      const processing = `${source}.processing-${process.pid}`
      try {
        fs.renameSync(source, processing)
      } catch {
        continue
      }
      try {
        this.spawnInstance()
      } finally {
        fs.rmSync(processing, { force: true })
      }
    }
  }

  private spawnInstance(): void {
    const slot = InstanceCoordinator.claimLowestSlot(this.runtimeDir)
    if (!slot) return
    const args = process.argv
      .slice(1)
      .filter((arg) => !arg.startsWith('--instance-index=') && !arg.startsWith('--instance-lease='))
    args.push(`--instance-index=${slot.index}`, `--instance-lease=${slot.leaseId}`)
    try {
      const child = spawn(process.execPath, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        shell: false
      })
      child.once('error', () =>
        InstanceCoordinator.removeOwned(this.slotPath(slot.index), slot.leaseId)
      )
      child.unref()
    } catch {
      InstanceCoordinator.removeOwned(this.slotPath(slot.index), slot.leaseId)
    }
  }

  private slotPath(index: number): string {
    return path.join(this.runtimeDir, 'slots', `${index}.json`)
  }

  private static parseIndex(): number | undefined {
    const value = this.argValue('--instance-index=')
    if (value === undefined) return undefined
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : undefined
  }

  private static argValue(prefix: string): string | undefined {
    return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
  }

  private static claimCoordinator(runtimeDir: string, leaseId: string): boolean {
    const file = path.join(runtimeDir, 'coordinator.json')
    const value = { pid: process.pid, leaseId, heartbeatAt: new Date().toISOString() }
    if (this.createExclusive(file, value)) return true
    const existing = this.readJson<CoordinatorFile>(file)
    if (existing && !this.isStale(existing.pid, existing.heartbeatAt)) return false
    try {
      fs.rmSync(file, { force: true })
    } catch {
      return false
    }
    return this.createExclusive(file, value)
  }

  private static claimExplicit(
    runtimeDir: string,
    index: number,
    leaseId: string,
    reserved: boolean
  ): boolean {
    const file = path.join(runtimeDir, 'slots', `${index}.json`)
    if (reserved) {
      const existing = this.readJson<LeaseFile>(file)
      if (!existing || existing.leaseId !== leaseId || existing.state !== 'reserved') return false
      this.atomicWrite(file, {
        ...existing,
        pid: process.pid,
        state: 'running',
        heartbeatAt: new Date().toISOString()
      })
      return true
    }
    const now = new Date().toISOString()
    const value: LeaseFile = {
      instanceIndex: index,
      pid: process.pid,
      leaseId,
      state: 'running',
      startedAt: now,
      heartbeatAt: now
    }
    if (this.createExclusive(file, value)) return true
    const existing = this.readJson<LeaseFile>(file)
    if (existing && !this.isLeaseStale(existing)) return false
    try {
      fs.rmSync(file, { force: true })
    } catch {
      return false
    }
    return this.createExclusive(file, value)
  }

  private static claimLowestSlot(
    runtimeDir: string
  ): { index: number; leaseId: string } | undefined {
    for (let index = 0; index <= 100; index += 1) {
      const file = path.join(runtimeDir, 'slots', `${index}.json`)
      const existing = this.readJson<LeaseFile>(file)
      if (existing && !this.isLeaseStale(existing)) continue
      if (existing)
        try {
          fs.rmSync(file, { force: true })
        } catch {
          continue
        }
      const leaseId = randomBytes(32).toString('base64url')
      const now = new Date().toISOString()
      if (
        this.createExclusive(file, {
          instanceIndex: index,
          pid: process.pid,
          leaseId,
          state: 'reserved',
          startedAt: now,
          heartbeatAt: now
        })
      )
        return { index, leaseId }
    }
    return undefined
  }

  private static enqueueRequest(runtimeDir: string): void {
    const file = path.join(runtimeDir, 'requests', `${Date.now()}-${randomUUID()}.json`)
    this.createExclusive(file, { pid: process.pid, requestedAt: new Date().toISOString() })
  }

  private static createExclusive(file: string, value: unknown): boolean {
    try {
      const fd = fs.openSync(file, 'wx', 0o600)
      try {
        fs.writeFileSync(fd, JSON.stringify(value), 'utf8')
      } finally {
        fs.closeSync(fd)
      }
      return true
    } catch {
      return false
    }
  }

  private static atomicWrite(file: string, value: unknown): void {
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporary, file)
  }

  private static readJson<T>(file: string): T | undefined {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as T
    } catch {
      return undefined
    }
  }

  private static isStale(pid: number, heartbeatAt: string): boolean {
    const stale = Date.now() - Date.parse(heartbeatAt) > 10_000
    if (!stale) return false
    try {
      process.kill(pid, 0)
      return false
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ESRCH'
    }
  }

  private static isLeaseStale(lease: LeaseFile): boolean {
    if (Date.now() - Date.parse(lease.heartbeatAt) <= 10_000) return false
    if (lease.state === 'reserved') return true
    return this.isStale(lease.pid, lease.heartbeatAt)
  }

  private static removeOwned(file: string, leaseId: string): void {
    const current = this.readJson<{ leaseId?: string }>(file)
    if (current?.leaseId === leaseId)
      try {
        fs.rmSync(file, { force: true })
      } catch {
        /* owner-only cleanup */
      }
  }
}
