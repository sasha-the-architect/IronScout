#!/usr/bin/env node
/**
 * Database Sync Script: Remote -> Local PostgreSQL
 * Cross-platform Node.js version
 *
 * Backs up a remote database and restores it to a local PostgreSQL instance.
 *
 * Usage:
 *   node scripts/sync-database.mjs
 *
 * Required environment variables:
 *   REMOTE_DATABASE_URL - Source database connection URL
 *   LOCAL_DATABASE_URL  - Target local database connection URL
 *
 * Or use .env file in project root with these variables.
 */

import { existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline'
import {
  colors,
  success,
  error,
  info,
  warn,
  header,
  run,
  runCapture,
  commandExists,
} from './lib/utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const BACKUP_DIR = resolve(PROJECT_ROOT, 'backups')

/**
 * Prompt user for confirmation
 */
function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

/**
 * Parse PostgreSQL connection URL
 */
function parseDbUrl(url) {
  const match = url.match(
    /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:\/]+)(?::(\d+))?\/(.+)$/
  )
  if (!match) {
    return null
  }
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: match[4] || '5432',
    database: match[5].split('?')[0],
  }
}

async function main() {
  // Load .env file if exists
  const envPath = resolve(PROJECT_ROOT, '.env')
  if (existsSync(envPath)) {
    const dotenv = await import('dotenv')
    dotenv.config({ path: envPath })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  console.log('==========================================')
  console.log('Database Sync: Remote -> Local')
  console.log(`Timestamp: ${timestamp}`)
  console.log('==========================================')
  console.log('')

  // Check for pg_dump and psql
  if (!commandExists('pg_dump')) {
    error('pg_dump not found. Please install PostgreSQL client tools.')
    process.exit(1)
  }
  if (!commandExists('psql')) {
    error('psql not found. Please install PostgreSQL client tools.')
    process.exit(1)
  }

  // Get connection URLs from environment
  const remoteUrl = process.env.REMOTE_DATABASE_URL
  const localUrl = process.env.LOCAL_DATABASE_URL

  if (!remoteUrl) {
    error('REMOTE_DATABASE_URL environment variable not set')
    info('Set it in .env file or export it:')
    console.log('  export REMOTE_DATABASE_URL="postgresql://user:pass@host/database"')
    process.exit(1)
  }

  if (!localUrl) {
    error('LOCAL_DATABASE_URL environment variable not set')
    info('Set it in .env file or export it:')
    console.log('  export LOCAL_DATABASE_URL="postgresql://user:pass@localhost/database"')
    process.exit(1)
  }

  const remoteDb = parseDbUrl(remoteUrl)
  const localDb = parseDbUrl(localUrl)

  if (!remoteDb || !localDb) {
    error('Invalid database URL format')
    info('Expected format: postgresql://user:password@host:port/database')
    process.exit(1)
  }

  // Create backup directory
  mkdirSync(BACKUP_DIR, { recursive: true })

  const backupFile = resolve(BACKUP_DIR, `backup_${timestamp}.sql`)
  const schemaFile = resolve(BACKUP_DIR, `schema_${timestamp}.sql`)

  // Step 1: Backup schema from remote
  console.log('')
  info('[1/5] Backing up schema from remote...')

  const schemaResult = runCapture(
    `pg_dump -h ${remoteDb.host} -p ${remoteDb.port} -U ${remoteDb.user} -d ${remoteDb.database} ` +
      `--schema-only --no-owner --no-privileges`,
    { env: { ...process.env, PGPASSWORD: remoteDb.password } }
  )

  if (!schemaResult.success) {
    error('Failed to backup schema')
    process.exit(1)
  }

  require('fs').writeFileSync(schemaFile, schemaResult.output)
  success(`Schema backup saved to: ${schemaFile}`)

  // Step 2: Full backup from remote
  console.log('')
  info('[2/5] Creating full backup from remote (schema + data)...')

  const fullResult = runCapture(
    `pg_dump -h ${remoteDb.host} -p ${remoteDb.port} -U ${remoteDb.user} -d ${remoteDb.database} ` +
      `--no-owner --no-privileges`,
    { env: { ...process.env, PGPASSWORD: remoteDb.password } }
  )

  if (!fullResult.success) {
    error('Failed to create full backup')
    process.exit(1)
  }

  require('fs').writeFileSync(backupFile, fullResult.output)
  success(`Full backup saved to: ${backupFile}`)

  // Step 3: Confirm with user
  console.log('')
  info('[3/5] Checking local database...')
  console.log(`Local host: ${localDb.host}`)
  console.log(`Local database: ${localDb.database}`)
  console.log('')
  warn('WARNING: This will DROP and recreate the local database!')
  warn('All existing data in the local database will be lost.')
  console.log('')

  const confirm = await prompt('Continue? (yes/no): ')
  if (confirm !== 'yes') {
    info('Aborted by user.')
    console.log('')
    console.log('Backup files created:')
    console.log(`  - Schema: ${schemaFile}`)
    console.log(`  - Full:   ${backupFile}`)
    process.exit(0)
  }

  // Step 4: Drop and recreate local database
  console.log('')
  info('[4/5] Recreating local database...')

  // Terminate existing connections
  const terminateResult = run(
    `psql -h ${localDb.host} -p ${localDb.port} -U ${localDb.user} -d postgres -c ` +
      `"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${localDb.database}' AND pid <> pg_backend_pid();"`,
    { silent: true, env: { ...process.env, PGPASSWORD: localDb.password } }
  )

  // Drop and create database
  const dropResult = run(
    `psql -h ${localDb.host} -p ${localDb.port} -U ${localDb.user} -d postgres -c ` +
      `"DROP DATABASE IF EXISTS ${localDb.database};"`,
    { env: { ...process.env, PGPASSWORD: localDb.password } }
  )

  const createResult = run(
    `psql -h ${localDb.host} -p ${localDb.port} -U ${localDb.user} -d postgres -c ` +
      `"CREATE DATABASE ${localDb.database};"`,
    { env: { ...process.env, PGPASSWORD: localDb.password } }
  )

  if (!createResult.success) {
    error('Failed to recreate local database')
    process.exit(1)
  }

  success('Local database recreated')

  // Step 5: Restore backup
  console.log('')
  info('[5/5] Restoring backup to local database...')

  const restoreResult = run(
    `psql -h ${localDb.host} -p ${localDb.port} -U ${localDb.user} -d ${localDb.database} -f "${backupFile}"`,
    { env: { ...process.env, PGPASSWORD: localDb.password }, silent: true }
  )

  if (!restoreResult.success) {
    warn('Some errors during restore (this may be normal for constraint issues)')
  }

  console.log('')
  console.log('==========================================')
  success('Sync complete!')
  console.log('==========================================')
  console.log('')
  console.log('Backup files:')
  console.log(`  - Schema only: ${schemaFile}`)
  console.log(`  - Full backup: ${backupFile}`)
  console.log('')
  console.log(`Local database '${localDb.database}' on ${localDb.host} is now synced.`)
}

main().catch((e) => {
  error(e.message)
  process.exit(1)
})
