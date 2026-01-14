#!/usr/bin/env node
/**
 * Build All IronScout Apps
 * Cross-platform Node.js version
 *
 * Usage:
 *   node scripts/build/build-all.mjs              # Full build + tests
 *   node scripts/build/build-all.mjs --skip-tests # Build without running tests
 *   node scripts/build/build-all.mjs --only web,api  # Build specific apps
 *   node scripts/build/build-all.mjs --skip-install  # Skip pnpm install
 *   node scripts/build/build-all.mjs --skip-prisma   # Skip Prisma generation
 */

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import {
  colors,
  success,
  error,
  info,
  warn,
  header,
  run,
  runCapture,
  parseArgs,
} from '../lib/utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '../..')

// Apps to build (in dependency order)
const APPS = [
  { name: 'notifications', filter: '@ironscout/notifications', command: 'build' },
  { name: 'api', filter: '@ironscout/api', command: 'build' },
  { name: 'web', filter: '@ironscout/web', command: 'build' },
  { name: 'admin', filter: '@ironscout/admin', command: 'build' },
  { name: 'merchant', filter: '@ironscout/merchant', command: 'build' },
  { name: 'harvester', filter: '@ironscout/harvester', command: 'build' },
]

// Test suites to run
const TEST_SUITES = [
  {
    name: 'harvester:schema',
    description: 'Schema validation (catches raw SQL bugs)',
    filter: '@ironscout/harvester',
    command: 'test:schema',
    critical: true,
  },
  {
    name: 'harvester:unit',
    description: 'Harvester unit tests',
    filter: '@ironscout/harvester',
    command: 'test:run',
    critical: true,
  },
]

async function main() {
  const startTime = Date.now()
  const args = parseArgs()

  const skipInstall = args.flags['skip-install']
  const skipPrisma = args.flags['skip-prisma']
  const skipTests = args.flags['skip-tests']
  const skipSchemaValidation = args.flags['skip-schema-validation']
  const only = args.flags.only ? args.flags.only.split(',') : null

  const results = {}
  const testResults = {}

  // Filter apps if --only specified
  let apps = APPS
  let testSuites = TEST_SUITES
  if (only) {
    apps = APPS.filter((a) => only.includes(a.name))
    testSuites = TEST_SUITES.filter((t) => {
      const suiteName = t.name.split(':')[0]
      return only.includes(suiteName)
    })
    info(`Building only: ${only.join(', ')}`)
  }

  // Step 0: Validate database schema
  if (!skipSchemaValidation) {
    header('Validating Database Schema')
    const validateScript = resolve(PROJECT_ROOT, 'scripts/validate-db-schema.mjs')
    if (existsSync(validateScript)) {
      const result = run(`node ${validateScript}`, { cwd: PROJECT_ROOT })
      if (!result.success) {
        error('Database schema validation failed')
        console.log('')
        warn('Fix schema issues before building. Run:')
        console.log('  node scripts/validate-db-schema.mjs --verbose')
        console.log('')
        process.exit(1)
      }
      success('Database schema validated')
    } else {
      info('validate-db-schema.mjs not found, skipping validation')
    }
  } else {
    info('Skipping database schema validation')
  }

  // Step 1: Install dependencies
  if (!skipInstall) {
    header('Installing Dependencies')
    const result = run('pnpm install --frozen-lockfile', { cwd: PROJECT_ROOT })
    if (result.success) {
      success('Dependencies installed')
    } else {
      error('Dependency installation failed')
      process.exit(1)
    }
  } else {
    info('Skipping dependency installation')
  }

  // Step 2: Generate Prisma client
  if (!skipPrisma) {
    header('Generating Prisma Client')

    // Prisma generate requires DATABASE_URL but doesn't connect
    const hadDatabaseUrl = !!process.env.DATABASE_URL
    if (!hadDatabaseUrl) {
      process.env.DATABASE_URL = 'postgresql://dummy:dummy@localhost:5432/dummy'
    }

    const result = run('pnpm prisma generate', {
      cwd: resolve(PROJECT_ROOT, 'packages/db'),
    })

    if (!hadDatabaseUrl) {
      delete process.env.DATABASE_URL
    }

    if (result.success) {
      success('Prisma client generated')
    } else {
      error('Prisma generation failed')
      process.exit(1)
    }
  } else {
    info('Skipping Prisma generation')
  }

  // Step 3: Build each app
  header('Building Apps')

  for (const app of apps) {
    const buildStart = Date.now()
    info(`Building ${app.name}...`)

    const result = run(`pnpm --filter ${app.filter} run ${app.command}`, {
      cwd: PROJECT_ROOT,
    })

    const duration = ((Date.now() - buildStart) / 1000).toFixed(1)

    if (result.success) {
      success(`${app.name} built successfully (${duration}s)`)
      results[app.name] = { success: true, duration }
    } else {
      error(`${app.name} build failed`)
      results[app.name] = { success: false, duration }
    }
  }

  // Step 4: Run tests
  if (!skipTests && testSuites.length > 0) {
    header('Running Tests')

    for (const suite of testSuites) {
      const testStart = Date.now()
      info(`Running ${suite.name} (${suite.description})...`)

      const result = run(`pnpm --filter ${suite.filter} run ${suite.command}`, {
        cwd: PROJECT_ROOT,
      })

      const duration = ((Date.now() - testStart) / 1000).toFixed(1)

      if (result.success) {
        success(`${suite.name} passed (${duration}s)`)
        testResults[suite.name] = { success: true, duration, critical: suite.critical }
      } else {
        error(`${suite.name} FAILED`)
        testResults[suite.name] = { success: false, duration, critical: suite.critical }
      }
    }
  } else {
    info('Skipping tests (use without --skip-tests to run)')
  }

  // Summary
  header('Build Summary')

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
  const successCount = Object.values(results).filter((r) => r.success).length
  const failCount = Object.values(results).filter((r) => !r.success).length

  console.log(`${colors.cyan}Builds:${colors.reset}`)
  for (const app of apps) {
    if (results[app.name]) {
      const r = results[app.name]
      if (r.success) {
        success(`  ${app.name} - ${r.duration}s`)
      } else {
        error(`  ${app.name} - FAILED`)
      }
    }
  }

  // Test summary
  const testSuccessCount = Object.values(testResults).filter((r) => r.success).length
  const testFailCount = Object.values(testResults).filter((r) => !r.success).length
  const criticalTestsFailed = Object.values(testResults).filter(
    (r) => !r.success && r.critical
  ).length

  if (Object.keys(testResults).length > 0) {
    console.log('')
    console.log(`${colors.cyan}Tests:${colors.reset}`)
    for (const [name, r] of Object.entries(testResults)) {
      if (r.success) {
        success(`  ${name} - ${r.duration}s`)
      } else {
        const criticalTag = r.critical ? ' [CRITICAL]' : ''
        error(`  ${name} - FAILED${criticalTag}`)
      }
    }
  }

  console.log('')
  const buildStatus = failCount === 0 ? colors.green : colors.red
  const testStatus = testFailCount === 0 ? colors.green : colors.red

  console.log(`${buildStatus}Builds: ${successCount} passed, ${failCount} failed${colors.reset}`)
  if (Object.keys(testResults).length > 0) {
    console.log(`${testStatus}Tests:  ${testSuccessCount} passed, ${testFailCount} failed${colors.reset}`)
  }
  console.log(`${colors.white}Total time: ${totalTime}s${colors.reset}`)

  // Check for failures
  let hasFailures = false
  const failureReasons = []

  if (failCount > 0) {
    hasFailures = true
    failureReasons.push('Failed builds:')
    for (const app of apps) {
      if (results[app.name] && !results[app.name].success) {
        failureReasons.push(`  - ${app.name}`)
      }
    }
  }

  if (criticalTestsFailed > 0) {
    hasFailures = true
    failureReasons.push('Failed critical tests:')
    for (const [name, r] of Object.entries(testResults)) {
      if (!r.success && r.critical) {
        failureReasons.push(`  - ${name}`)
      }
    }
  }

  if (hasFailures) {
    console.log('')
    for (const line of failureReasons) {
      console.log(`${colors.red}${line}${colors.reset}`)
    }
    console.log('')
    warn('Fix the errors above before pushing to production.')
    process.exit(1)
  }

  console.log('')
  console.log(`${colors.green}All builds and tests passed! Safe to push to Render.${colors.reset}`)
  process.exit(0)
}

main().catch((e) => {
  error(e.message)
  process.exit(1)
})
