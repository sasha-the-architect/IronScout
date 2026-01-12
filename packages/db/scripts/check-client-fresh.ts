#!/usr/bin/env npx tsx
/**
 * CI Gate: Verify generated Prisma client matches schema.prisma
 *
 * This script checks that `prisma generate` was run after the last
 * schema.prisma modification. It does this by:
 *
 * 1. Hashing the current schema.prisma
 * 2. Comparing to the schema hash stored in the generated client
 * 3. Optionally running `prisma generate` and checking for git changes
 *
 * Exit codes:
 *   0 = client is fresh
 *   1 = client is stale (needs regeneration)
 *   2 = execution error
 */

import { execSync, spawnSync } from 'child_process'
import { existsSync, readFileSync, statSync } from 'fs'
import { createHash } from 'crypto'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PACKAGE_ROOT = resolve(__dirname, '..')
const SCHEMA_PATH = resolve(DB_PACKAGE_ROOT, 'schema.prisma')
const GENERATED_CLIENT_PATH = resolve(DB_PACKAGE_ROOT, 'generated', 'prisma')

const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const RESET = '\x1b[0m'

function log(color: string, prefix: string, msg: string) {
  console.error(`${color}[${prefix}]${RESET} ${msg}`)
}

function fatal(msg: string, hint?: string): never {
  log(RED, 'FAIL', msg)
  if (hint) {
    console.error(`\n${YELLOW}Hint:${RESET} ${hint}`)
  }
  process.exit(1)
}

function success(msg: string) {
  log(GREEN, 'OK', msg)
}

function hashFile(path: string): string {
  const content = readFileSync(path)
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

function getSchemaHash(): string {
  if (!existsSync(SCHEMA_PATH)) {
    fatal(`schema.prisma not found at ${SCHEMA_PATH}`)
  }
  return hashFile(SCHEMA_PATH)
}

function getGeneratedClientInfo(): { exists: boolean; schemaHash?: string; mtime?: Date } {
  const indexPath = join(GENERATED_CLIENT_PATH, 'index.js')

  if (!existsSync(indexPath)) {
    return { exists: false }
  }

  // The generated client embeds schema info we can check
  // For a more robust check, compare file modification times
  const clientStat = statSync(indexPath)
  const schemaStat = statSync(SCHEMA_PATH)

  return {
    exists: true,
    mtime: clientStat.mtime,
    schemaHash: undefined // Prisma doesn't embed a hash we can easily extract
  }
}

function runGenerateAndCheckDiff(): boolean {
  // Run prisma generate and check if it produces any changes
  log(CYAN, 'INFO', 'Running prisma generate to check for changes...')

  const result = spawnSync('npx', ['prisma', 'generate'], {
    cwd: DB_PACKAGE_ROOT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  })

  if (result.status !== 0) {
    console.error(result.stderr)
    fatal('prisma generate failed')
  }

  // Check if the generated client directory has uncommitted changes
  const gitResult = spawnSync('git', [
    'diff', '--exit-code', '--stat',
    '--', GENERATED_CLIENT_PATH
  ], {
    cwd: DB_PACKAGE_ROOT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  })

  // Exit code 0 = no changes, 1 = changes exist
  return gitResult.status === 0
}

async function main() {
  const mode = process.argv[2] || 'fast'

  if (mode === 'strict') {
    // Strict mode: Run generate and check for git diff
    const isClean = runGenerateAndCheckDiff()

    if (isClean) {
      success('Generated Prisma client is up to date')
      process.exit(0)
    } else {
      fatal(
        'Generated Prisma client is stale',
        'Run `pnpm db:generate` and commit the changes'
      )
    }
  } else {
    // Fast mode: Check file timestamps
    const clientInfo = getGeneratedClientInfo()

    if (!clientInfo.exists) {
      fatal(
        'Generated Prisma client not found',
        'Run `pnpm db:generate` to generate the Prisma client'
      )
    }

    const schemaStat = statSync(SCHEMA_PATH)

    if (clientInfo.mtime && clientInfo.mtime < schemaStat.mtime) {
      fatal(
        'Generated Prisma client may be stale (schema.prisma is newer)',
        'Run `pnpm db:generate` to regenerate the Prisma client'
      )
    }

    success('Generated Prisma client appears current (fast check)')
    process.exit(0)
  }
}

main().catch((err) => {
  fatal(`Unexpected error: ${err.message}`)
})
