import { spawnSync } from 'node:child_process'
import path from 'node:path'

const now = new Date()
const outputTimestamp =
  `${now.getFullYear()}` +
  `${String(now.getMonth() + 1).padStart(2, '0')}` +
  `${String(now.getDate()).padStart(2, '0')}` +
  `-${String(now.getHours()).padStart(2, '0')}` +
  `${String(now.getMinutes()).padStart(2, '0')}` +
  `${String(now.getSeconds()).padStart(2, '0')}` +
  `${String(now.getMilliseconds()).padStart(3, '0')}`
const outputDirectory = path.join('release', `ai-bridge-${outputTimestamp}`)
const builderCli = path.resolve('node_modules/electron-builder/cli.js')
const result = spawnSync(
  process.execPath,
  [builderCli, '--dir', `--config.directories.output=${outputDirectory}`],
  { stdio: 'inherit' }
)

if (result.error) {
  console.error(`electron-builder failed to start: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
