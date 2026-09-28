const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ARCH_NAME_BY_ID = {
  0: 'ia32',
  1: 'x64',
  2: 'armv7l',
  3: 'arm64',
  4: 'universal'
}

function archNameFromContext(arch) {
  if (typeof arch === 'string') return arch
  return ARCH_NAME_BY_ID[arch] || String(arch)
}

function walkFiles(rootDir, visit) {
  if (!fs.existsSync(rootDir)) return
  const stack = [rootDir]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(fullPath)
      else if (entry.isFile()) visit(fullPath)
    }
  }
}

function removePath(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true })
}

/**
 * Keep only native prebuilds that can run on the packaged platform/arch.
 * darwin ships a universal `darwin-x64+arm64` folder; keep it and thin later.
 */
function shouldKeepPrebuildDir(dirName, platform, archName) {
  if (platform === 'darwin') {
    return dirName === 'darwin-x64+arm64' || dirName === `darwin-${archName}`
  }
  if (platform === 'linux') {
    if (archName === 'armv7l') return dirName === 'linux-arm'
    return dirName === `linux-${archName}`
  }
  if (platform === 'win32') {
    return dirName === `win32-${archName}`
  }
  return false
}

function cleanSerialPortPrebuilds(appOutDir, platform, archName) {
  const removed = []
  const stack = [appOutDir]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (!entry.isDirectory()) continue
      if (entry.name === 'prebuilds' && current.replace(/\\/g, '/').includes('/@serialport/')) {
        for (const prebuild of fs.readdirSync(fullPath, { withFileTypes: true })) {
          if (!prebuild.isDirectory()) continue
          if (shouldKeepPrebuildDir(prebuild.name, platform, archName)) continue
          const target = path.join(fullPath, prebuild.name)
          removePath(target)
          removed.push(path.relative(appOutDir, target))
        }
        continue
      }
      stack.push(fullPath)
    }
  }
  return removed
}

function removeNodeGypBins(appOutDir) {
  const removed = []
  const stack = [appOutDir]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (!entry.isDirectory()) continue
      if (entry.name === 'node_gyp_bins') {
        removePath(fullPath)
        removed.push(path.relative(appOutDir, fullPath))
        continue
      }
      stack.push(fullPath)
    }
  }
  return removed
}

function isMachOFile(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(4)
    const read = fs.readSync(fd, buf, 0, 4, 0)
    fs.closeSync(fd)
    if (read < 4) return false
    const magic = buf.readUInt32BE(0)
    // Mach-O / fat magics (both endians)
    return (
      magic === 0xcafebabe ||
      magic === 0xbebafeca ||
      magic === 0xfeedface ||
      magic === 0xcefaedfe ||
      magic === 0xfeedfacf ||
      magic === 0xcffaedfe
    )
  } catch {
    return false
  }
}

function lipoInfo(filePath) {
  if (!isMachOFile(filePath)) return ''
  try {
    return execFileSync('lipo', ['-info', filePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 3000
    }).trim()
  } catch {
    return ''
  }
}

function thinMacBinaryToArch(filePath, archName) {
  try {
    if (!isMachOFile(filePath)) return false
    const info = lipoInfo(filePath)
    if (!info) return false
    const lipoArch = archName === 'x64' ? 'x86_64' : archName
    const isFat = info.includes('Architectures in the fat file') || /\bare:\s/.test(info)
    if (!isFat) return false
    if (!info.includes(lipoArch)) return false

    const tempPath = `${filePath}.thin`
    execFileSync('lipo', [filePath, '-thin', lipoArch, '-output', tempPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000
    })
    fs.renameSync(tempPath, filePath)
    return true
  } catch (error) {
    console.warn(`afterPack: failed to thin ${filePath}:`, error instanceof Error ? error.message : error)
    try {
      fs.rmSync(`${filePath}.thin`, { force: true })
    } catch {
      // ignore cleanup failure
    }
    return false
  }
}

function thinMacNativeModules(appOutDir, archName) {
  const thinned = []
  // Only touch native addon payloads; Electron framework itself is already single-arch.
  walkFiles(appOutDir, (fullPath) => {
    if (!fullPath.endsWith('.node')) return
    if (!fullPath.replace(/\\/g, '/').includes('/node_modules/')) return
    if (thinMacBinaryToArch(fullPath, archName)) {
      thinned.push(path.relative(appOutDir, fullPath))
    }
  })
  return thinned
}

module.exports = async function (context) {
  const sandbox = path.join(context.appOutDir, 'chrome-sandbox')
  if (fs.existsSync(sandbox)) {
    fs.chmodSync(sandbox, 0o4755)
    console.log('afterPack: chrome-sandbox permissions set to 4755')
  }

  const platform = context.electronPlatformName
  const archName = archNameFromContext(context.arch)
  console.log(`afterPack: cleaning native extras for ${platform}/${archName}`)

  try {
    const removedPrebuilds = cleanSerialPortPrebuilds(context.appOutDir, platform, archName)
    if (removedPrebuilds.length) {
      console.log(`afterPack: removed ${removedPrebuilds.length} serialport prebuild dir(s)`)
      for (const item of removedPrebuilds) console.log(`  - ${item}`)
    }

    const removedBins = removeNodeGypBins(context.appOutDir)
    if (removedBins.length) {
      console.log(`afterPack: removed ${removedBins.length} node_gyp_bins dir(s)`)
    }

    // lipo thin 仅 macOS；Windows/Linux 只做 prebuild/node_gyp_bins 清理，不改主程序架构
    if (platform === 'darwin' && (archName === 'arm64' || archName === 'x64')) {
      const thinned = thinMacNativeModules(context.appOutDir, archName)
      if (thinned.length) {
        console.log(`afterPack: thinned ${thinned.length} fat native module(s) to ${archName}`)
        for (const item of thinned) console.log(`  - ${item}`)
      }
    }
  } catch (error) {
    // 清理失败不应阻断打包；最多保留未精简的 native 文件
    console.warn('afterPack: native cleanup failed:', error instanceof Error ? error.message : error)
  }
}

module.exports._test = {
  archNameFromContext,
  shouldKeepPrebuildDir,
  cleanSerialPortPrebuilds,
  removeNodeGypBins,
  thinMacBinaryToArch,
  isMachOFile
}
