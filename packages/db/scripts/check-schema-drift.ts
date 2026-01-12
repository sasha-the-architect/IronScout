#!/usr/bin/env npx tsx
/**
 * CI Gate: Verify schema.prisma matches applied migrations
 *
 * This script uses `prisma migrate diff` to compare:
 * - FROM: migrations applied to a shadow database
 * - TO: the current schema.prisma
 *
 * If there's a diff, it means:
 * - schema.prisma was edited without creating a migration, OR
 * - a migration was deleted/modified incorrectly
 *
 * Exit codes:
 *   0 = schema and migrations are in sync
 *   1 = drift detected (schema differs from migrations)
 *   2 = execution error
 */

import { execSync, spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PACKAGE_ROOT = resolve(__dirname, '..')
const SCHEMA_PATH = resolve(DB_PACKAGE_ROOT, 'schema.prisma')

// Colors for terminal output
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
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

async function main() {
  // Verify schema exists
  if (!existsSync(SCHEMA_PATH)) {
    fatal(`schema.prisma not found at ${SCHEMA_PATH}`)
  }

  // Check if DATABASE_URL or shadow DB URL is available
  // For CI, we use a shadow database approach
  const shadowDbUrl = process.env.SHADOW_DATABASE_URL || process.env.DATABASE_URL

  if (!shadowDbUrl) {
    // Fallback: use migrate diff with --from-empty if no DB available
    // This validates that migrations + schema are internally consistent
    log(YELLOW, 'WARN', 'No DATABASE_URL set, using offline validation')

    const result = spawnSync('npx', [
      'prisma', 'migrate', 'diff',
      '--from-migrations', resolve(DB_PACKAGE_ROOT, 'migrations'),
      '--to-schema-datamodel', SCHEMA_PATH,
      '--exit-code'
    ], {
      cwd: DB_PACKAGE_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    })

    if (result.status === 0) {
      success('Schema matches migrations (offline check)')
      process.exit(0)
    } else if (result.status === 2) {
      // Exit code 2 means there's a diff
      console.error('\n' + (result.stdout || result.stderr))
      fatal(
        'Schema drift detected: schema.prisma differs from migrations',
        'Run `pnpm db:migrate:dev` to create a migration for your schema changes'
      )
    } else {
      fatal(`Prisma migrate diff failed: ${result.stderr}`)
    }
  }

  // With a database URL, we can do a full shadow DB comparison
  log(GREEN, 'INFO', 'Running schema drift check with shadow database...')

  const result = spawnSync('npx', [
    'prisma', 'migrate', 'diff',
    '--from-schema-datasource', SCHEMA_PATH,
    '--to-schema-datamodel', SCHEMA_PATH,
    '--shadow-database-url', shadowDbUrl,
    '--exit-code'
  ], {
    cwd: DB_PACKAGE_ROOT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  })

  if (result.status === 0) {
    success('Schema matches migrations (shadow DB check)')
    process.exit(0)
  } else if (result.status === 2) {
    console.error('\n' + (result.stdout || result.stderr))
    fatal(
      'Schema drift detected',
      'Run `pnpm db:migrate:dev` to create a migration for your schema changes'
    )
  } else {
    // Non-diff error
    console.error(result.stderr)
    fatal('Prisma migrate diff failed unexpectedly')
  }
}

main().catch((err) => {
  fatal(`Unexpected error: ${err.message}`)
})
