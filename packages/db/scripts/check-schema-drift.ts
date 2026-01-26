#!/usr/bin/env npx tsx
/**
 * CI Gate: Verify schema.prisma is valid and migrations are applied
 *
 * This script validates:
 * 1. The schema.prisma file is syntactically valid
 * 2. All migrations have been applied to the database (if DATABASE_URL is set)
 *
 * Exit codes:
 *   0 = schema valid and migrations in sync
 *   1 = validation failed or pending migrations
 */

import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env files (local package first, then root)
config({ path: resolve(__dirname, '..', '.env') })
config({ path: resolve(__dirname, '..', '..', '..', '.env') })

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

  // Step 1: Validate schema syntax
  log(GREEN, 'INFO', 'Validating schema syntax...')

  const validateResult = spawnSync('npx', [
    'prisma', 'validate'
  ], {
    cwd: DB_PACKAGE_ROOT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  })

  if (validateResult.status !== 0) {
    console.error(validateResult.stderr)
    fatal('Schema validation failed')
  }

  success('Schema syntax is valid')

  // Step 2: Check migration status (only if DATABASE_URL is set)
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    log(YELLOW, 'WARN', 'No DATABASE_URL set, skipping migration status check')
    process.exit(0)
  }

  log(GREEN, 'INFO', 'Checking migration status...')

  const statusResult = spawnSync('npx', [
    'prisma', 'migrate', 'status'
  ], {
    cwd: DB_PACKAGE_ROOT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL: databaseUrl }
  })

  const output = statusResult.stdout + statusResult.stderr

  // Check for pending migrations or drift
  if (output.includes('Database schema is up to date')) {
    success('Database schema is up to date')
    process.exit(0)
  }

  if (output.includes('Following migration') || output.includes('not yet applied')) {
    console.error(output)
    fatal(
      'Pending migrations detected',
      'Run `pnpm db:migrate:deploy` to apply migrations'
    )
  }

  if (output.includes('drift') || output.includes('out of sync')) {
    console.error(output)
    fatal(
      'Schema drift detected',
      'Run `pnpm db:migrate:dev` to create a migration for your schema changes'
    )
  }

  // If status command failed but didn't give clear output
  if (statusResult.status !== 0) {
    console.error(output)
    fatal('Migration status check failed')
  }

  success('Migrations are in sync')
}

main().catch((err) => {
  fatal(`Unexpected error: ${err.message}`)
})
