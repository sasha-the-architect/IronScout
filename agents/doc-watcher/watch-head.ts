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
import fs from 'fs'
import path from 'path'
const isWin = process.platform === 'win32'
const pnpmCmd = isWin ? 'pnpm.cmd' : 'pnpm'

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string) {
  const ts = new Date().toISOString()
  console.log(`[${ts}] [${level}] ${msg}`)
}

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8' }).trim()
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const intervalSec = parseInt(process.argv[2] || '120', 10)
  const repoRoot = run('git rev-parse --show-toplevel')
  // Basic checks
  try {
    const pkgPath = path.join(repoRoot, 'package.json')
    if (!fs.existsSync(pkgPath)) {
      log('WARN', `[head-watcher] package.json not found at ${pkgPath}. pnpm doc:watch may fail.`)
    }
  } catch (err) {
    log('WARN', `[head-watcher] Unable to verify package.json: ${err}`)
  }
  try {
    const pnpmVersion = run(`${pnpmCmd} --version`)
    log('INFO', `[head-watcher] pnpm version detected: ${pnpmVersion}`)
  } catch (err) {
    log('ERROR', `[head-watcher] pnpm not found. Install pnpm or ensure it's on PATH. ${err}`)
    process.exit(1)
  }
  let lastHead = ''

  try {
    lastHead = run('git rev-parse HEAD')
    log('INFO', `[head-watcher] Starting at ${lastHead}, interval ${intervalSec}s`)
  } catch (err) {
    log('ERROR', `[head-watcher] Failed to read HEAD: ${err}`)
    process.exit(1)
  }

  for (;;) {
    await sleep(intervalSec * 1000)
    let current = ''
    try {
      current = run('git rev-parse HEAD')
    } catch (err) {
      log('WARN', `[head-watcher] Failed to read HEAD: ${err}`)
      continue
    }
    if (current !== lastHead) {
      log('INFO', `[head-watcher] HEAD changed: ${lastHead} -> ${current}. Running doc watcher...`)
      const res = spawnSync(
        isWin ? 'cmd.exe' : pnpmCmd,
        isWin ? ['/c', 'pnpm', 'doc:watch'] : ['doc:watch'],
        { stdio: 'inherit', cwd: repoRoot, shell: false }
      )
      if (res.error) {
        log('ERROR', `[head-watcher] Failed to run pnpm doc:watch: ${res.error.message}`)
      } else if (res.status !== 0) {
        log('WARN', `[head-watcher] doc:watch exited with ${res.status ?? 'unknown status'}`)
      }
      lastHead = current
    }
  }
}

main().catch((err) => {
  console.error('[head-watcher] fatal error:', err)
  process.exit(1)
})
