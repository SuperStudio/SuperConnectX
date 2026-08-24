/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */

/**
 * Windows -> Linux 交叉打包的 afterPack 适配器。
 *
 * electron-builder 可以在 Windows 下载 Linux Electron 并生成 linux-unpacked，
 * 但 npmRebuild 仍可能把活动 native binding 生成为 Windows PE。这里不编译
 * Linux 原生代码，而是从 serialport 官方随包提供的 Linux x64 glibc prebuild
 * 中选择 ELF binding，并移除无法在 Linux 加载的 Windows 可选 binding。
 *
 * Linux 文件权限最终还会由 buildLinuxDebCrossWin.py 写入 data.tar.xz；这里的
 * chmod 同时保证 linux-unpacked 在支持 Unix 权限的文件系统上具有合理权限。
 */
const fs = require('fs')
const path = require('path')

const assertElf = (filePath, label) => {
  const magic = fs.readFileSync(filePath).subarray(0, 4)
  if (!magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    throw new Error(`${label} is not a Linux ELF file: ${filePath}`)
  }
}

module.exports = async function afterPackLinuxCrossWin(context) {
  if (process.platform !== 'win32') {
    throw new Error('afterPackLinuxCrossWin.cjs is only for Windows -> Linux cross packaging')
  }
  if (context.electronPlatformName !== 'linux' || context.arch !== 1) {
    throw new Error(
      `Expected Linux x64 output, got ${context.electronPlatformName}/${context.arch}`
    )
  }

  const appOutDir = context.appOutDir
  const unpackedModules = path.join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules')
  const serialRoot = path.join(unpackedModules, '@serialport', 'bindings-cpp')
  const linuxBinding = path.join(
    serialRoot,
    'prebuilds',
    'linux-x64',
    '@serialport+bindings-cpp.glibc.node'
  )
  const activeBinding = path.join(serialRoot, 'build', 'Release', 'bindings.node')

  if (!fs.existsSync(linuxBinding)) {
    throw new Error(`Linux serialport prebuild is missing: ${linuxBinding}`)
  }
  assertElf(linuxBinding, 'serialport Linux x64 glibc prebuild')
  fs.mkdirSync(path.dirname(activeBinding), { recursive: true })
  fs.copyFileSync(linuxBinding, activeBinding)
  assertElf(activeBinding, 'active serialport binding')

  // cpu-features 是 ssh2 的可选加速依赖。Windows rebuild 产生的 PE binding
  // 不能进入 Linux 包；删除后 ssh2 会按其既有逻辑回退到纯 JavaScript 路径。
  const cpuBinding = path.join(
    unpackedModules,
    'cpu-features',
    'build',
    'Release',
    'cpufeatures.node'
  )
  if (fs.existsSync(cpuBinding)) fs.rmSync(cpuBinding, { force: true })

  const mainExecutable = path.join(appOutDir, 'superconnectx')
  assertElf(mainExecutable, 'Linux Electron executable')

  for (const name of ['superconnectx', 'chrome-sandbox', 'chrome_crashpad_handler']) {
    const target = path.join(appOutDir, name)
    if (fs.existsSync(target)) fs.chmodSync(target, name === 'chrome-sandbox' ? 0o4755 : 0o755)
  }

  console.log('cross-win afterPack: Linux x64 ELF bindings and executable permissions verified')
}
