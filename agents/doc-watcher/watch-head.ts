/**
 * HEAD watcher: polls the current git HEAD and runs the doc watcher when it changes.
 *
 * Usage:
 *   pnpm exec tsx agents/doc-watcher/watch-head.ts            # default 120s interval
 *   pnpm exec tsx agents/doc-watcher/watch-head.ts 60         # custom interval (seconds)
 *
 * You can launch this in a background terminal or Task Scheduler to keep it running while coding.
 */
import { execSync, spawnSync } from 'child_process'
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8' }).trim()
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const intervalSec = parseInt(process.argv[2] || '120', 10)
  let lastHead = ''

  try {
    lastHead = run('git rev-parse HEAD')
    console.log(`[head-watcher] Starting at ${lastHead}, interval ${intervalSec}s`)
  } catch (err) {
    console.error('[head-watcher] Failed to read HEAD:', err)
    process.exit(1)
  }

  for (;;) {
    await sleep(intervalSec * 1000)
    let current = ''
    try {
      current = run('git rev-parse HEAD')
    } catch (err) {
      console.error('[head-watcher] Failed to read HEAD:', err)
      continue
    }
    if (current !== lastHead) {
      console.log(`[head-watcher] HEAD changed: ${lastHead} -> ${current}. Running doc watcher...`)
      const res = spawnSync(pnpmCmd, ['doc:watch'], { stdio: 'inherit' })
      if (res.error) {
        console.error('[head-watcher] Failed to run pnpm doc:watch:', res.error.message)
      } else if (res.status !== 0) {
        console.error('[head-watcher] doc:watch exited with', res.status ?? 'unknown status')
      }
      lastHead = current
    }
  }
}

main().catch((err) => {
  console.error('[head-watcher] fatal error:', err)
  process.exit(1)
})
