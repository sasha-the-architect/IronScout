#!/usr/bin/env node
/**
 * Seed Production Database Script
 * Cross-platform Node.js version
 *
 * Usage: node scripts/seeding/seed-production.mjs
 */

import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '../..')
const DB_PACKAGE = resolve(PROJECT_ROOT, 'packages/db')

// ANSI colors
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
}

function log(msg) {
  console.log(msg)
}

function success(msg) {
  console.log(`${colors.green}[OK]${colors.reset} ${msg}`)
}

function error(msg) {
  console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`)
}

function info(msg) {
  console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`)
}

function run(cmd, cwd = PROJECT_ROOT) {
  try {
    execSync(cmd, { cwd, stdio: 'inherit' })
    return true
  } catch (e) {
    return false
  }
}

async function main() {
  log('')
  log('========================================')
  log('  Seeding Production Database')
  log('========================================')
  log('')

  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    error('DATABASE_URL environment variable not set')
    log('')
    info('Please set it to your production database URL:')
    log('  export DATABASE_URL="postgresql://user:pass@host/database"')
    log('')
    process.exit(1)
  }

  info(`Using database: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`)
  log('')

  // Step 1: Seed retailers
  log('Step 1: Seeding retailers...')
  if (!run('pnpm db:seed-retailers', DB_PACKAGE)) {
    error('Failed to seed retailers')
    process.exit(1)
  }
  success('Retailers seeded')
  log('')

  // Step 2: Seed comprehensive products
  log('Step 2: Seeding comprehensive products (657 products)...')
  if (!run('pnpm db:seed-comprehensive', DB_PACKAGE)) {
    error('Failed to seed products')
    process.exit(1)
  }
  success('Products seeded')
  log('')

  // Step 3: Seed price history
  log('Step 3: Seeding price history (90 days)...')
  if (!run('pnpm db:seed-price-history', DB_PACKAGE)) {
    error('Failed to seed price history')
    process.exit(1)
  }
  success('Price history seeded')
  log('')

  log('========================================')
  success('Production database seeded successfully!')
  log('========================================')
  log('')
  info('Next steps:')
  log('1. Test search on Render: https://ironscout-web.onrender.com/search?q=ammo')
  log('2. Products should now appear in search results')
  log('')
}

main().catch((e) => {
  error(e.message)
  process.exit(1)
})
