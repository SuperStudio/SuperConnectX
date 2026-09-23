/**
 * scripts/rebuild-native.mjs
 *
 * Rebuilds native Node modules against the installed Electron version.
 *
 * Why not `electron-builder install-app-deps`?
 *   It rebuilds EVERY native module including optional dependencies.
 *   `cpu-features@0.0.10` (an optional dep of ssh2) ships a broken tarball
 *   (missing buildcheck.gypi) and always fails to compile — hard-failing the
 *   whole postinstall under pnpm's dependency layout. ssh2 itself ships
 *   prebuilt bindings and does not need a rebuild.
 *
 * So we rebuild only what actually needs it: @serialport/bindings-cpp.
 *
 * Usage: node scripts/rebuild-native.mjs   (invoked from package.json postinstall)
 */
import { createRequire } from 'node:module'
import { rebuild } from '@electron/rebuild'

const require = createRequire(import.meta.url)

async function main() {
  const electronVersion = require('electron/package.json').version

  await rebuild({
    buildPath: process.cwd(),
    electronVersion,
    // Only rebuild what needs it (see header comment). Adding a new native
    // dependency? Append its package name here.
    onlyModules: ['@serialport/bindings-cpp']
  })

  console.log(`[rebuild-native] done (electron ${electronVersion})`)
}

main().catch((error) => {
  console.error('[rebuild-native] failed:', error)
  process.exit(1)
})
