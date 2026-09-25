import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const afterPack = require('../../scripts/afterPack.js')
const {
  archNameFromContext,
  shouldKeepPrebuildDir,
  cleanSerialPortPrebuilds,
  removeNodeGypBins,
  thinMacBinaryToArch,
  isMachOFile
} = afterPack._test

describe('afterPack helpers', () => {
  it('maps electron-builder arch ids to names', () => {
    expect(archNameFromContext(3)).toBe('arm64')
    expect(archNameFromContext(1)).toBe('x64')
    expect(archNameFromContext('arm64')).toBe('arm64')
  })

  it('keeps only current-platform serialport prebuilds', () => {
    expect(shouldKeepPrebuildDir('darwin-x64+arm64', 'darwin', 'arm64')).toBe(true)
    expect(shouldKeepPrebuildDir('darwin-x64+arm64', 'darwin', 'x64')).toBe(true)
    expect(shouldKeepPrebuildDir('darwin-arm64', 'darwin', 'arm64')).toBe(true)
    expect(shouldKeepPrebuildDir('win32-x64', 'darwin', 'arm64')).toBe(false)
    expect(shouldKeepPrebuildDir('linux-x64', 'linux', 'x64')).toBe(true)
    expect(shouldKeepPrebuildDir('linux-arm64', 'linux', 'x64')).toBe(false)
    expect(shouldKeepPrebuildDir('win32-x64', 'win32', 'x64')).toBe(true)
    expect(shouldKeepPrebuildDir('win32-ia32', 'win32', 'x64')).toBe(false)
  })

  it('removes cross-platform serialport prebuilds from staged app', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'afterpack-'))
    const prebuilds = path.join(
      root,
      'superconnectx.app/Contents/Resources/app.asar.unpacked/node_modules/@serialport/bindings-cpp/prebuilds'
    )
    for (const name of ['darwin-x64+arm64', 'win32-x64', 'linux-x64', 'android-arm64']) {
      fs.mkdirSync(path.join(prebuilds, name), { recursive: true })
      fs.writeFileSync(path.join(prebuilds, name, 'dummy.node'), 'x')
    }

    const removed = cleanSerialPortPrebuilds(root, 'darwin', 'arm64')
    expect(removed.some((item: string) => item.includes('win32-x64'))).toBe(true)
    expect(removed.some((item: string) => item.includes('linux-x64'))).toBe(true)
    expect(fs.existsSync(path.join(prebuilds, 'darwin-x64+arm64'))).toBe(true)
    expect(fs.existsSync(path.join(prebuilds, 'win32-x64'))).toBe(false)
  })

  it('keeps win32-x64 prebuilds when packaging windows', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'afterpack-win-'))
    const prebuilds = path.join(root, 'resources/app.asar.unpacked/node_modules/@serialport/bindings-cpp/prebuilds')
    for (const name of ['win32-x64', 'darwin-x64+arm64', 'linux-x64']) {
      fs.mkdirSync(path.join(prebuilds, name), { recursive: true })
      fs.writeFileSync(path.join(prebuilds, name, 'dummy.node'), 'x')
    }

    cleanSerialPortPrebuilds(root, 'win32', 'x64')
    expect(fs.existsSync(path.join(prebuilds, 'win32-x64'))).toBe(true)
    expect(fs.existsSync(path.join(prebuilds, 'darwin-x64+arm64'))).toBe(false)
    expect(fs.existsSync(path.join(prebuilds, 'linux-x64'))).toBe(false)
  })

  it('removes node_gyp_bins leftovers', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'afterpack-bins-'))
    const bins = path.join(root, 'node_modules/@serialport/bindings-cpp/build/node_gyp_bins')
    fs.mkdirSync(bins, { recursive: true })
    fs.writeFileSync(path.join(bins, 'python3'), 'x')

    const removed = removeNodeGypBins(root)
    expect(removed).toHaveLength(1)
    expect(fs.existsSync(bins)).toBe(false)
  })

  it('rejects non-mach-o files without calling a hanging lipo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'afterpack-nonmacho-'))
    const filePath = path.join(dir, 'bindings.node')
    fs.writeFileSync(filePath, 'not a mach-o')
    expect(isMachOFile(filePath)).toBe(false)
    expect(thinMacBinaryToArch(filePath, 'arm64')).toBe(false)
  })

  // Only run real lipo thinning on Apple Silicon hosts.
  // Intel runners can time out when cross-compiling -arch arm64; Windows has no lipo/this.skip.
  it.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64')(
    'thins fat mach-o node binaries to the current mac arch',
    () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'afterpack-lipo-'))
      const src = path.join(dir, 'empty.c')
      const arm = path.join(dir, 'arm64.o')
      const x64 = path.join(dir, 'x64.o')
      const fat = path.join(dir, 'bindings.node')
      fs.writeFileSync(src, 'int addon=1;')
      execFileSync('clang', ['-c', src, '-o', arm, '-arch', 'arm64'])
      execFileSync('clang', ['-c', src, '-o', x64, '-arch', 'x86_64'])
      execFileSync('lipo', ['-create', arm, x64, '-output', fat])

      expect(thinMacBinaryToArch(fat, 'arm64')).toBe(true)
      const info = execFileSync('lipo', ['-info', fat], { encoding: 'utf8' })
      expect(info).toContain('arm64')
      expect(info).not.toContain('x86_64')

      // Rebuild fat and verify x64 thinning path too.
      execFileSync('lipo', ['-create', arm, x64, '-output', fat])
      expect(thinMacBinaryToArch(fat, 'x64')).toBe(true)
      const x64Info = execFileSync('lipo', ['-info', fat], { encoding: 'utf8' })
      expect(x64Info).toContain('x86_64')
      expect(x64Info).not.toContain('arm64')
    },
    30000
  )
})
