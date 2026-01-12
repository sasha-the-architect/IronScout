#!/usr/bin/env npx tsx
/**
 * Prestart Database Health Check
 *
 * Run before starting api/harvester to verify:
 * 1. DATABASE_URL is set and reachable
 * 2. Migrations are applied (no pending migrations)
 * 3. Generated Prisma client exists and is reasonably fresh
 *
 * Modes:
 *   --fast   : Quick checks only (default for dev)
 *   --strict : Full validation including schema diff
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = check failed with actionable fix
 *   2 = fatal error
 */

import { spawnSync } from 'child_process'
import { existsSync, statSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PACKAGE_ROOT = resolve(__dirname, '..')
const SCHEMA_PATH = resolve(DB_PACKAGE_ROOT, 'schema.prisma')
const GENERATED_CLIENT_PATH = resolve(DB_PACKAGE_ROOT, 'generated', 'prisma')

// Terminal colors
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

interface CheckResult {
  ok: boolean
  message: string
  fix?: string
}

function log(color: string, prefix: string, msg: string) {
  console.error(`${color}[${prefix}]${RESET} ${msg}`)
}

function printResult(name: string, result: CheckResult) {
  if (result.ok) {
    log(GREEN, '✓', `${name}: ${result.message}`)
  } else {
    log(RED, '✗', `${name}: ${result.message}`)
    if (result.fix) {
      console.error(`  ${YELLOW}Fix:${RESET} ${result.fix}`)
    }
  }
}

function printBanner() {
  console.error(`\n${CYAN}${BOLD}══════════════════════════════════════════${RESET}`)
  console.error(`${CYAN}${BOLD}  Prisma Database Prestart Check${RESET}`)
  console.error(`${CYAN}${BOLD}══════════════════════════════════════════${RESET}\n`)
}

// Check 1: DATABASE_URL is set
function checkDatabaseUrl(): CheckResult {
  const url = process.env.DATABASE_URL

  if (!url) {
    return {
      ok: false,
      message: 'DATABASE_URL environment variable is not set',
      fix: 'Set DATABASE_URL in your .env file or environment'
    }
  }

  // Basic URL validation
  try {
    const parsed = new URL(url)
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      return {
        ok: false,
        message: `Invalid DATABASE_URL protocol: ${parsed.protocol}`,
        fix: 'DATABASE_URL must start with postgres:// or postgresql://'
      }
    }
  } catch {
    return {
      ok: false,
      message: 'DATABASE_URL is not a valid URL',
      fix: 'Check DATABASE_URL format: postgresql://user:pass@host:port/db'
    }
  }

  return { ok: true, message: 'DATABASE_URL is set' }
}

// Check 2: Database is reachable
async function checkDatabaseConnection(): Promise<CheckResult> {
  const result = spawnSync('npx', [
    'prisma', 'db', 'execute',
    '--stdin',
    '--schema', SCHEMA_PATH
  ], {
    cwd: DB_PACKAGE_ROOT,
    input: 'SELECT 1;',
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    timeout: 10000
  })

  if (result.status === 0) {
    return { ok: true, message: 'Database is reachable' }
  }

  const errorMsg = result.stderr || result.error?.message || 'Unknown error'

  if (errorMsg.includes('ECONNREFUSED')) {
    return {
      ok: false,
      message: 'Cannot connect to database (connection refused)',
      fix: 'Start your database: pnpm db:up (or check if PostgreSQL is running)'
    }
  }

  if (errorMsg.includes('authentication failed') || errorMsg.includes('password')) {
    return {
      ok: false,
      message: 'Database authentication failed',
      fix: 'Check DATABASE_URL credentials'
    }
  }

  if (errorMsg.includes('does not exist')) {
    return {
      ok: false,
      message: 'Database does not exist',
      fix: 'Create the database or run: pnpm db:reset'
    }
  }

  return {
    ok: false,
    message: `Database connection failed: ${errorMsg.slice(0, 100)}`,
    fix: 'Check DATABASE_URL and ensure PostgreSQL is running'
  }
}

// Check 3: Migrations are applied
async function checkMigrations(): Promise<CheckResult> {
  const result = spawnSync('npx', [
    'prisma', 'migrate', 'status',
    '--schema', SCHEMA_PATH
  ], {
    cwd: DB_PACKAGE_ROOT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    timeout: 30000
  })

  const output = result.stdout + result.stderr

  if (output.includes('Database schema is up to date')) {
    return { ok: true, message: 'All migrations applied' }
  }

  if (output.includes('Following migration have not yet been applied')) {
    return {
      ok: false,
      message: 'Pending migrations detected',
      fix: 'Run: pnpm db:migrate:dev (development) or pnpm db:migrate:deploy (production)'
    }
  }

  if (output.includes('drift') || output.includes('edited')) {
    return {
      ok: false,
      message: 'Schema drift detected',
      fix: 'Run: pnpm db:migrate:dev to create migration for schema changes'
    }
  }

  if (result.status !== 0) {
    return {
      ok: false,
      message: 'Could not check migration status',
      fix: 'Ensure database is accessible and try: pnpm db:migrate:status'
    }
  }

  return { ok: true, message: 'Migration status OK' }
}

// Check 4: Generated client exists and is fresh
function checkGeneratedClient(): CheckResult {
  const indexPath = join(GENERATED_CLIENT_PATH, 'index.js')

  if (!existsSync(indexPath)) {
    return {
      ok: false,
      message: 'Generated Prisma client not found',
      fix: 'Run: pnpm db:generate'
    }
  }

  // Check if schema is newer than generated client
  const schemaStat = statSync(SCHEMA_PATH)
  const clientStat = statSync(indexPath)

  if (clientStat.mtime < schemaStat.mtime) {
    return {
      ok: false,
      message: 'Generated client may be stale (schema.prisma is newer)',
      fix: 'Run: pnpm db:generate'
    }
  }

  return { ok: true, message: 'Generated client exists and appears current' }
}

// Check 5 (strict only): Schema matches migrations
async function checkSchemaDrift(): Promise<CheckResult> {
  const result = spawnSync('npx', [
    'prisma', 'migrate', 'diff',
    '--from-migrations', resolve(DB_PACKAGE_ROOT, 'migrations'),
    '--to-schema-datamodel', SCHEMA_PATH,
    '--exit-code'
  ], {
    cwd: DB_PACKAGE_ROOT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    timeout: 60000
  })

  if (result.status === 0) {
    return { ok: true, message: 'Schema matches migrations' }
  }

  if (result.status === 2) {
    return {
      ok: false,
      message: 'Schema drift: schema.prisma differs from migrations',
      fix: 'Run: pnpm db:migrate:dev to create a migration'
    }
  }

  return {
    ok: false,
    message: 'Could not verify schema drift',
    fix: 'Run: pnpm db:check:strict for details'
  }
}

async function main() {
  const args = process.argv.slice(2)
  const strictMode = args.includes('--strict')
  const skipConnection = args.includes('--skip-connection')

  printBanner()

  const results: { name: string; result: CheckResult }[] = []

  // Fast checks (always run)
  results.push({ name: 'DATABASE_URL', result: checkDatabaseUrl() })
  results.push({ name: 'Generated Client', result: checkGeneratedClient() })

  // Connection-dependent checks
  if (!skipConnection && results[0].result.ok) {
    results.push({ name: 'Database Connection', result: await checkDatabaseConnection() })

    if (results[results.length - 1].result.ok) {
      results.push({ name: 'Migrations', result: await checkMigrations() })
    }
  }

  // Strict mode: additional schema drift check
  if (strictMode) {
    results.push({ name: 'Schema Drift', result: await checkSchemaDrift() })
  }

  // Print results
  console.error('')
  for (const { name, result } of results) {
    printResult(name, result)
  }
  console.error('')

  // Summary
  const failures = results.filter(r => !r.result.ok)

  if (failures.length === 0) {
    log(GREEN, 'READY', 'All database checks passed')
    process.exit(0)
  } else {
    log(RED, 'BLOCKED', `${failures.length} check(s) failed`)
    console.error('')
    console.error(`${YELLOW}Quick fixes:${RESET}`)
    console.error('  pnpm db:up        # Start local PostgreSQL')
    console.error('  pnpm db:generate  # Regenerate Prisma client')
    console.error('  pnpm db:migrate   # Apply pending migrations')
    console.error('  pnpm db:reset     # Full reset (destroys data)')
    console.error('')
    process.exit(1)
  }
}

main().catch((err) => {
  log(RED, 'ERROR', `Unexpected error: ${err.message}`)
  process.exit(2)
})
