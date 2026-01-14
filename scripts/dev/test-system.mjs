#!/usr/bin/env node
/**
 * IronScout System Test Script
 * Verifies each component is working
 *
 * Usage: node scripts/dev/test-system.mjs
 */

import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  colors,
  success,
  error,
  info,
  warn,
  run,
  runCapture,
  commandExists,
} from '../lib/utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '../..')

function header() {
  console.log('======================================')
  console.log('IronScout System Test')
  console.log('======================================')
  console.log('')
}

async function main() {
  header()

  let allPassed = true

  // Test 1: Check Redis
  process.stdout.write('1. Testing Redis connection... ')
  if (commandExists('redis-cli')) {
    const result = runCapture('redis-cli ping')
    if (result.success && result.output === 'PONG') {
      console.log(`${colors.green}PASS${colors.reset}`)
    } else {
      console.log(`${colors.red}FAIL${colors.reset}`)
      console.log('   Redis is not running. Start it:')
      console.log('   - macOS: brew services start redis')
      console.log('   - Linux: sudo service redis-server start')
      console.log('   - Windows: Start Redis from WSL or Docker')
      allPassed = false
    }
  } else {
    console.log(`${colors.yellow}SKIP${colors.reset}`)
    console.log('   redis-cli not found. Install Redis to enable this check.')
  }

  // Test 2: Check PostgreSQL via Prisma
  process.stdout.write('2. Testing PostgreSQL connection... ')
  const dbResult = run('pnpm exec prisma db execute --stdin', {
    cwd: resolve(PROJECT_ROOT, 'packages/db'),
    silent: true,
    input: 'SELECT 1;',
  })
  if (dbResult.success) {
    console.log(`${colors.green}PASS${colors.reset}`)
  } else {
    console.log(`${colors.red}FAIL${colors.reset}`)
    console.log('   Check DATABASE_URL in packages/db/.env')
    allPassed = false
  }

  // Test 3: Check Prisma Client
  process.stdout.write('3. Checking Prisma client... ')
  const prismaClientPath = resolve(PROJECT_ROOT, 'packages/db/generated/prisma')
  if (existsSync(prismaClientPath)) {
    console.log(`${colors.green}PASS${colors.reset}`)
  } else {
    console.log(`${colors.yellow}Generating...${colors.reset}`)
    const genResult = run('pnpm db:generate', { cwd: resolve(PROJECT_ROOT, 'packages/db') })
    if (genResult.success) {
      console.log(`   ${colors.green}PASS${colors.reset}`)
    } else {
      console.log(`   ${colors.red}FAIL${colors.reset}`)
      allPassed = false
    }
  }

  // Test 4: Check for migrations
  process.stdout.write('4. Checking database schema... ')
  const migrateStatus = runCapture('pnpm exec prisma migrate status', {
    cwd: resolve(PROJECT_ROOT, 'packages/db'),
  })
  if (migrateStatus.success && migrateStatus.output.includes('Database schema is up to date')) {
    console.log(`${colors.green}PASS${colors.reset}`)
  } else if (migrateStatus.output.includes('have not yet been applied')) {
    console.log(`${colors.yellow}Running migrations...${colors.reset}`)
    const migrateResult = run('pnpm db:migrate', { cwd: resolve(PROJECT_ROOT, 'packages/db') })
    if (migrateResult.success) {
      console.log(`   ${colors.green}PASS${colors.reset}`)
    } else {
      console.log(`   ${colors.red}FAIL${colors.reset}`)
      allPassed = false
    }
  } else {
    console.log(`${colors.yellow}UNKNOWN${colors.reset}`)
    console.log('   Could not determine migration status')
  }

  // Test 5: Check API dependencies
  process.stdout.write('5. Checking API dependencies... ')
  if (existsSync(resolve(PROJECT_ROOT, 'apps/api/node_modules'))) {
    console.log(`${colors.green}PASS${colors.reset}`)
  } else {
    console.log(`${colors.yellow}Installing...${colors.reset}`)
    run('pnpm install', { cwd: PROJECT_ROOT })
    console.log(`   ${colors.green}PASS${colors.reset}`)
  }

  // Test 6: Check harvester dependencies
  process.stdout.write('6. Checking harvester dependencies... ')
  if (existsSync(resolve(PROJECT_ROOT, 'apps/harvester/node_modules'))) {
    console.log(`${colors.green}PASS${colors.reset}`)
  } else {
    console.log(`${colors.yellow}Installing...${colors.reset}`)
    run('pnpm install', { cwd: PROJECT_ROOT })
    console.log(`   ${colors.green}PASS${colors.reset}`)
  }

  // Summary
  console.log('')
  console.log('======================================')
  if (allPassed) {
    console.log(`${colors.green}All checks passed!${colors.reset}`)
  } else {
    console.log(`${colors.red}Some checks failed!${colors.reset}`)
  }
  console.log('======================================')
  console.log('')

  if (allPassed) {
    console.log('Next steps:')
    console.log('')
    console.log('1. Start all services:')
    console.log('   node scripts/dev/start-all.mjs')
    console.log('')
    console.log('2. Or start individually:')
    console.log('   cd apps/harvester && pnpm worker')
    console.log('   cd apps/api && pnpm dev')
    console.log('   cd apps/web && pnpm dev')
    console.log('')
    console.log('3. Access admin console:')
    console.log('   http://localhost:3000/admin')
    console.log('')
  }

  process.exit(allPassed ? 0 : 1)
}

main().catch((e) => {
  error(e.message)
  process.exit(1)
})
